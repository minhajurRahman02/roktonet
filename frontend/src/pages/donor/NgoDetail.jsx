import { useParams } from 'react-router-dom';
import NgoDetailView from '../../components/organisms/NgoDetailView';

export default function NgoDetail() {
  const { orgId } = useParams();
  return <NgoDetailView orgId={orgId} backTo="/donor/browse" backLabel="Back to Browse Drives" />;
}
