import { useState, useEffect, useRef } from 'react';
import { seasonalCurve, riskCheck, TIMEOUT_STRIP, TIMEOUT_CARD } from '../api/roktim';
import { toModelName } from './districts';
import { advisoryText, seasonalPosition, suggestions, parseDate } from './copy';

// One hook behind both in-app surfaces, so the strip and the card can never
// disagree about what Roktim says for the same request.
//
// THE CURVE CACHE
// ---------------
// A district's 52-week seasonal profile is a property of the frozen model
// artefact. It cannot change while the page is open, so fetching it twice is
// pure waste, and on the request form the user types a date and changes their
// mind several times before submitting. Module-level rather than component
// state because the strip and the card are different components that want the
// same answer.
const curveCache = new Map();

async function getCurve(modelDistrict) {
  if (curveCache.has(modelDistrict)) return curveCache.get(modelDistrict);
  const promise = seasonalCurve({ unit: modelDistrict, grain: 'district' });
  // The in-flight promise is cached, not just the result, so two surfaces
  // mounting together make one request rather than two.
  curveCache.set(modelDistrict, promise);
  const curve = await promise;
  // A failure must not be cached forever, or one cold start would leave Roktim
  // permanently silent for that district until a full page reload.
  if (!curve) curveCache.delete(modelDistrict);
  return curve;
}

/**
 * @param {{district: string, neededByDate: string, urgencyTier: string,
 *          quantity: number, component?: string, enabled?: boolean,
 *          withRiskCheck?: boolean, debounceMs?: number}} args
 * @returns {{loading: boolean, curve: object|null, advisory: object|null,
 *            text: object|null, position: object|null, tips: string[]}}
 */
export default function useRoktimAdvisory({
  district,
  neededByDate,
  urgencyTier,
  quantity = 1,
  component,
  enabled = true,
  withRiskCheck = false,
  debounceMs = 400,
}) {
  const [state, setState] = useState({ loading: false, curve: null, advisory: null });
  const runId = useRef(0);

  // Roktim exists for one case and must not fire for any other. An elective
  // request is the only one where the engine's own check cannot answer the
  // question, because it is the only one whose blood is needed on a future
  // date rather than now.
  const active =
    enabled && urgencyTier === 'elective' && !!district && !!neededByDate && !!parseDate(neededByDate);

  useEffect(() => {
    if (!active) {
      setState({ loading: false, curve: null, advisory: null });
      return undefined;
    }

    const id = ++runId.current;
    setState((s) => ({ ...s, loading: true }));

    // Debounced because the date input fires on every keystroke in a typed
    // date, and each pass is a cross-origin request to a service that may be
    // cold.
    const timer = setTimeout(async () => {
      const modelDistrict = toModelName(district);
      const timeout = withRiskCheck ? TIMEOUT_CARD : TIMEOUT_STRIP;

      const [curve, advisory] = await Promise.all([
        getCurve(modelDistrict),
        withRiskCheck
          ? riskCheck({
              district: modelDistrict,
              unitsRequired: quantity,
              neededByDate,
              // A hospital holds no RoktoNet inventory by design, so zero is a
              // fact about the schema here, not a placeholder. See the note in
              // api/roktim.js.
              currentStockUnits: 0,
              timeout,
            })
          : Promise.resolve(null),
      ]);

      // A slower earlier run must never overwrite a newer one. Without this the
      // strip can settle on the advisory for a date the user has already
      // changed away from.
      if (id !== runId.current) return;
      setState({ loading: false, curve, advisory });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [active, district, neededByDate, quantity, withRiskCheck, debounceMs]);

  const date = parseDate(neededByDate);
  const position = state.curve ? seasonalPosition(state.curve, date) : null;
  const text = state.curve
    ? advisoryText({
        district,
        neededByDate,
        curve: state.curve,
        advisory: state.advisory,
      })
    : null;
  const tips = state.curve
    ? suggestions({ advisory: state.advisory, position, component })
    : [];

  return { ...state, text, position, tips };
}
