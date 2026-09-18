-- ============================================================================
-- migration_backfill_seed_donors.sql  (rev 2 -- explicit ID list)
--
-- Gives the 200 SEED donor rows a `sex` and a `last_donation_component`, so
-- the computed eligibility model has something to compute with.
--
-- WHY REV 2. Rev 1 guarded on `full_name IS NULL`, on the reasoning that the
-- seed INSERT never wrote a name while both registration paths always do.
-- That was wrong. routes/auth.js inserts `full_name || null`, so a
-- self-registered donor whose users row had no name also lands with a NULL
-- full_name. Your database has exactly four of them:
--
--     no_name_total   204
--     looks_like_seed 200
--     no_name_but_real  4
--
-- Rev 1 would have written invented sexes and donation components onto four
-- real donors. Rev 1's own preflight did not catch it either, because I wrote
-- the check as `full_name IS NOT NULL AND sex IS NULL` -- which the UPDATE
-- filter excludes by construction, so it could never have failed no matter
-- how wrong the guard was.
--
-- So this version does not reason about a predicate at all. The 200 donor_id
-- values below were extracted directly from seed_data.sql, which is the only
-- authority on what is and is not a seed row. A predicate is an argument
-- about the data; a list of primary keys is the data.
--
-- WHY BACKFILLING SEED ROWS IS NOT WHAT THE LAST MIGRATION REFUSED TO DO.
--
-- migration_drop_eligibility_status.sql deliberately did NOT backfill, and
-- said so: inventing a sex or a component to make the numbers look tidier
-- would reintroduce the class of problem that migration removed. That holds
-- for REAL rows, where a fabricated value is a claim about a real person
-- nobody ever made. Seed rows are synthetic by definition --
-- generate_seed_data.py already invents their blood type, their org and their
-- last_donation_date. It never emitted these two columns because they did not
-- exist yet. This finishes the generator's job.
--
-- Run one statement at a time. Idempotent: each only touches rows where the
-- target column is still NULL.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. PROVE THE GUARD. Do not skip.
--
--   seed_ids_found          must be 200  (every listed ID exists)
--   real_rows_in_the_list   must be 0    (nothing with a phone, district or
--                                         login is in the list)
--
-- The second column is the check rev 1 should have had: it asks whether the
-- set this migration will actually write to contains anything that looks like
-- a real donor, rather than asking an unrelated question about rows it was
-- never going to touch.
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*)                                                        AS seed_ids_found,
  COUNT(*) FILTER (WHERE phone_number IS NOT NULL
                      OR current_district IS NOT NULL
                      OR user_id IS NOT NULL)                     AS real_rows_in_the_list,
  COUNT(*) FILTER (WHERE last_donation_date IS NOT NULL)          AS will_get_a_component,
  COUNT(*) FILTER (WHERE sex IS NULL)                             AS will_get_a_sex
FROM donors
WHERE donor_id IN (
    '8307d783-a64f-4e4c-9112-04500a6cc356', 'f9ec247d-5fc4-4548-b317-ca4afa5486a1', '1f79d275-f587-41a7-aca0-6c92616e2cbe', '5b7e2375-2d31-4aea-b549-2a9f3e5916c0', '098799eb-2500-45fe-8d2a-a8100f7be8de', 'ee73f53e-953a-4a96-8375-84c1e86f04a2',
    'a6ba8155-bdb6-4453-8ea3-c0a32510a804', 'fcc29793-1d94-4d27-ba31-a854c1b3f4e5', '1bd76d2f-744d-4cc6-a8f8-b38dae137e68', 'e907da67-48bf-459a-80f5-31815cc6e81e', '183de600-83b7-434f-a6f1-6a83898a734b', 'e29a27f9-721c-42c2-987f-7f3775a1de5a',
    'd89bdb24-a7a7-40e0-a794-16e3bfe0fb52', '46af632a-ff3c-441d-a6a9-3a0be9dd143a', '642cfe22-a580-49f0-9b6c-e2b8cedbc61d', '501b2947-8b75-4165-aabd-bd31fb6e9d80', '2a04f4bb-357b-4deb-a133-e99bc5bb1237', 'a683fee9-06b9-43bc-b320-6728ad873b56',
    '7ebd7714-751f-421c-8412-1591fb0b7133', '3eae7dda-3a19-4112-b324-057716b8e906', '23561448-e1e7-4ca8-b5b7-052e2e5b6574', '6be51557-b58a-4467-9698-004e6fa5607e', 'a477d5ae-6550-4c67-9e6b-9458b2941e7f', '492760da-2050-47ee-9b35-ef7b1844aaef',
    '67b28e18-13c0-407c-b84e-3c674977901d', '6d6e2329-16d3-42a0-b706-0799fbc927a3', '951758dc-cdbf-4fa3-95fb-caac9aeeedae', '9f336c9a-42ea-40ea-b538-a33fb345b09c', 'd7b92b16-6bab-4cca-bac1-a3b2d1fbed4f', '590d5fc3-68f3-4dc6-a465-12cd362feb76',
    '8543b032-7c43-4752-a28c-ef15833893d7', 'bea0ca60-59e7-4edc-9d95-977e75973bc1', 'b0c69251-95d0-4419-a203-b493155b743a', '22f4b157-1a1e-4084-9eec-779f5b30a0b0', '77f68a13-4504-41dc-abdc-e7b8bf4df1e4', 'a92f21cf-d7d4-42da-9d82-351fdd6c8901',
    '02cfb4b9-56e7-41d7-ae71-fa0ef346c271', '511784c9-e65b-4c86-9887-0a2e507c774b', 'f75201c1-e25e-4646-b73a-1d65bff941d5', '65fe869e-6ebb-460e-a70c-db44e0ed4bc5', '6fec49cd-8bbd-4656-8fe7-00e5b449c63f', '1608a133-8944-45ac-a200-1d2512d03d81',
    '6792ab35-fcb7-486b-a51a-192b974da98a', 'b053a986-c63a-42db-97a7-2550cc1db8ff', '47c40860-1f0b-4031-9d6d-ad6f2012cbfb', '809cf201-a9f6-4e00-b3b4-f1bf363f046b', 'f55f7ca4-468c-4bc4-8edc-048c8ab619ee', 'd92d478d-5f73-4bd4-93c5-9ec92bb5c003',
    '1d5112c6-7cc6-42ab-b511-5d2196514f19', '96317228-bd79-406c-81ce-a665df8f1bc0', '9186f676-4bb6-4638-866d-ea5e53a9341f', '7ad001df-ded4-4023-9b14-53c63163a279', '46783d4f-e94f-4184-a729-90a16a1d1559', '77d3baf8-62c7-445f-9ef7-9c97b34fa34a',
    'c9ea4600-ee3e-4211-b387-fdb116ef73aa', 'c043c928-a891-411d-adba-0e9115a3834c', '9dda625d-c823-4291-ade2-56e962fdd0f7', 'd192f60a-1f3d-4f20-b1db-f1a70d14f176', '873ffb53-5f65-47ef-83a9-3338f80e21dc', 'c906f0e6-eb63-477d-aa30-c1fc166bfb83',
    '1a898bb8-3ff6-4301-a1df-7bfd06e94a41', 'ca55e4ce-f78f-4006-9fe9-366ca4fc8e7c', 'eaa9d335-a09d-45eb-acb3-5d9bdfd9928c', 'da32fa9a-5228-4d90-bfec-0b7e99c60993', '5c8bdc71-57c5-467e-ab0d-c2492ede669e', 'dd654e59-f769-4d07-bf0a-e84e7fed83d8',
    '7841582b-e531-4c8b-be4e-e8a4c07f22c0', '0e08238e-7b56-4517-81cd-2369d91fb437', '0f086c56-ed2a-4f73-9853-a84b2177bf6b', '13dfccc3-9c02-4e66-ac1e-9a9ae490f104', '02129691-c98b-4f90-b924-36c185bbe978', 'b00def50-3cd5-4d3c-a096-049a5ffe7c21',
    'aab56259-1cab-4151-8b1b-16f58ddbd72c', '6f585b55-a273-4af8-857a-141556f76b47', '762a14dd-49d9-408a-85eb-450739384a69', '171d4b3b-250e-43a0-b19c-af91302f868e', 'c513792d-51a2-444d-b901-29afb2d528ff', '8c714611-0799-4378-a7e1-6310c4e548fd',
    'dbe72551-dafe-4113-ac27-6a156496466c', '827d8111-8a33-485b-8ed8-cef0fbdf9d1b', 'c7e6e656-372d-4d3f-915e-d793b8ac4056', 'cbbba24d-67bb-4c40-b07b-79a0d1562e8e', 'f72102a2-e98b-481a-854b-2c0b5c603dfa', 'a6787938-fe8e-4a85-9269-defc6736e73c',
    '2394ade9-6dc2-4042-9235-91534f256a73', 'fa9f2057-3212-4125-999d-c6b9c998d177', '54b012b0-0860-4cc9-8b49-ff4cd90f4a70', '029d52f4-b23a-46ac-83d5-40cb5db2b23f', '91116575-22c8-4ccf-bdb0-03e38252a7bd', 'ab085655-d52a-49b8-aa77-36c1e0209581',
    'de969bd1-0fab-4365-be64-eec9864cf274', 'cb2d47ed-4ed4-4bd8-8854-797518d86f34', 'b7361560-8d23-440d-bdf5-1e5f4b98968b', '2006ca5c-e760-4326-b7ff-672228c8d3ce', 'dd6dfa72-073b-4bee-b85e-df6114ff7f1b', 'e652fe17-aa67-4f3d-862d-b6bf864b6340',
    'ad57a30b-b7bf-4240-83a0-089ee1d301d1', '1485494b-92af-4df6-a2b3-ae8b5d6d95dc', '813eeee7-bb00-436d-bf0e-f30db66f993b', '5d6e0029-0a0c-4518-8f22-860d7ef2ad26', '386ee787-ae8c-4f52-be29-ce86ca89fe01', 'd03c2bea-bdb9-4e02-b069-6f866aef620d',
    'eda2ea8f-07a2-49f3-9f56-3559333ef61f', '02478849-d354-4d1c-9ef2-c866d4d368ca', '279bef6b-ebaa-4a4b-b6dd-9dfe0157eedc', '5430cafa-a7e4-4e34-85fc-ba46407b33d1', 'aaace6ec-62d3-427c-adb1-7f7522b0ee9d', '9c85637e-eba9-4121-98b4-bc3ff545ca93',
    'cd6868aa-2ed0-4b00-bf58-4ca35f004e54', 'f54de5c0-74dc-4eff-8938-878ef80a5219', 'f94f3835-71b5-4fb4-8e6a-b3f7cba492cb', '469b3a08-fdbb-47ea-8ac4-10921e04ac11', '62cad3e0-38de-4127-a75e-0762d78991d2', '155f96a9-b340-4acd-be0b-da048cda4af6',
    'cd3fbe9b-7c89-49b3-acd1-c244aad4ad47', 'ad1650ee-99a7-480c-8b46-db978b9ac1ed', '42d22d6a-1c53-4bbd-a62c-ca37de67b925', '52c3476b-adb1-4271-960b-fb664774b05e', '22642184-3d3d-47b3-bb80-f272979d6565', 'c1ebd549-ede4-4c94-90ab-b71ecc71ae55',
    '7cea8475-33fd-4174-ba12-a7139668e7a9', '3c5ed1a7-5f61-46df-9d68-afbec592db32', 'e2935b80-c3d7-4bf9-b584-a25f0b4ab4db', 'cd334a14-e979-4f0f-9997-41db4bb64f86', '55f09bf7-0cde-40e1-be0e-1403cb7e27e6', '96baef8c-1093-47d2-ad44-82dd589a5b63',
    '5b806179-70ca-4389-b5de-d96a2ace7c21', 'ec11b9c5-4505-4b78-91b0-588ffa3ce83f', 'c4e37de3-516a-4cfe-b3f3-feb9081ea0eb', '839c15f2-a0ea-4546-931d-25f4ffb0c66e', '3eddb902-486e-438f-9529-8f59bcc52310', 'f13da2e3-4a0b-4d1a-afd2-f0d8395d9df9',
    '9206d275-2be8-4479-a824-5bcd0a0f21bf', '4f752d8e-181c-448f-be99-9d4ba25630af', '35d42652-53f0-4fed-972e-f573edb6d604', '0f0e9ff8-13a3-4abe-adfe-94c8f9b614d3', 'bbf5631d-e81b-475e-b9a9-2117612bf61c', '4848febc-e1e1-4f90-824c-2e82a1a2aa17',
    'aa9096d3-6413-4065-bd30-5679cec4c554', '017d8ee4-a87f-4149-bd3a-fdc5b3155a78', '4eab3211-8b77-40bf-ae30-008c22b148a2', '812ad5ae-73e5-4570-8ec7-4ec0ed9e3b8d', '5f636512-5d31-4b13-9864-5a8cd8ca0862', '062b8749-b126-4ac9-9b7b-b85ba0310190',
    '5ef947fa-2556-42d1-b8af-1ee808d44a58', '1ef5a8eb-1945-4910-ae07-58a8cf7e027f', '26c583f6-f267-402f-b0b8-0fabc3d7cf25', '135f51bd-fdcd-414a-a1bc-996b1b77a7cc', '8e26bb4f-91ef-4984-9f22-92df0ee66499', 'cd958450-71da-4263-8aea-4f76642aaaf4',
    'af8fc869-8f3b-4e1f-9181-1511805647ed', 'e86e552a-8ed8-49c3-90e1-c4976dc308f8', 'd78e4581-11df-4425-bd43-2be1c0c3e24c', 'f5d9a899-116a-4e91-a725-6f39b5490d7b', '65118be1-75ac-45fb-a69d-eb79da77a374', '4b2a8e35-9047-4822-bc90-f7c00efc3998',
    'a114d905-5d41-444c-bbab-de92e7b84d53', '951ebe33-b0b1-49f2-8537-4f38b38a43b4', '25936258-1928-4fff-bc15-97c36011765a', '3d81e3f3-6433-44d3-9f37-68d7e06ce563', '896d712e-8ab0-456d-a1da-180e1a612101', '25cd7c49-e561-4fd6-b1d4-2e29796b457a',
    '6bab3eb1-5f49-43e5-967a-6187e351c4a2', '175661d8-e0c9-4d23-bb5d-ede687b81444', 'a47135e0-c1b7-4332-ad6a-0d2ad8138b86', '2cb7ce6d-380d-4ab4-8faf-752545bc9e53', '7a304cbc-0c75-4816-b6c5-cfe744cf77e8', 'ff649d87-329e-4d67-9118-ed4ffd1403d9',
    'c55b4502-7dfc-4ca5-a2f6-9e7409a786d6', '292317c1-9c5b-4b64-99b4-c75c84052415', 'a3b0a885-c8d2-4e85-bfff-7a43a70b7867', 'f3b490f6-f92f-4736-a36c-bd8b4615f3a0', '17c80d74-8269-417e-80e1-0a67cb4bd873', 'e064a6b8-571e-426f-b6cf-afd7e8b2e3fd',
    '6a7e5852-c828-4577-ac29-818e07d910f0', 'e0944593-27ab-462e-b794-5485cd9f1812', 'a9d56059-8d26-42ba-b820-7770afc44bfc', '9d9a99b0-be6e-4f66-9d49-08dd073344ae', 'ea112b8b-953c-4e2e-857a-301efbe27bbc', '966fa5f8-6d00-4a0f-9d3a-ac3549c7ba69',
    'e504a301-3405-463e-87db-6a60e9761343', 'b353514e-6ff0-4f7c-9d07-cac7a122849b', '8fecd8e5-b0d0-4893-a392-2a971b2c9321', '52e2e7eb-4eb6-4698-b16f-3fb5234597a5', '719b3ab4-2f1c-48df-8599-beaeb49d0499', '42f74702-cb1b-432a-993c-6ff3d770f607',
    '3af94917-c3b7-4544-8683-5396a4e4441f', '33802202-6c74-44b6-befb-588bb1cd5437', '5dea993f-75d0-4968-9e52-c6fd8f822dd4', '82eaf42b-30c5-45b2-a8c0-6a6139e4ef0b', 'c1ae6320-a3c7-4458-9c17-9d6717a21520', '70e86532-ebd7-4825-8398-60b6834e8f8f',
    '7577c535-7161-4ef2-a3dc-0c30b366c008', 'fcf7d494-8254-40b4-9145-3ce6062dc245', '0b4019d5-51c9-4b3a-a87d-07d48d268935', '72bede5d-500e-4555-bd85-110efa7ba9d9', '44fa2df8-0848-4a80-9da1-03b8b5bfeec6', '197fdfcd-6fa6-4f1e-bd74-ed2c064b8548',
    'caf68ae1-ba69-42c4-92ec-b27a1b4e9322', 'ddc841c0-7759-4b78-a8e6-28f859859b07'
);


-- ----------------------------------------------------------------------------
-- 1. Sex.
--
-- An even 50/50 split, chosen ON PURPOSE rather than to model reality.
--
-- Whole blood is the only sex-dependent number in the model (120 days male,
-- 180 female), and an even split is what makes both branches visible in a
-- 200-row table. A skewed split would represent one interval so thinly that a
-- reviewer scrolling the Donors page might never see it.
--
-- This is NOT a claim about the sex distribution of blood donors in
-- Bangladesh. I have no sourced figure for that, and encoding a guessed one
-- would be worse than an obviously arbitrary split, because it would look
-- like a finding.
--
-- The four real no-name donors, and the seven real donors missing sex, are
-- outside this list and stay untouched. They keep falling back to the
-- conservative 180-day interval, which can only say "not yet" rather than
-- wrongly saying "go ahead".
-- ----------------------------------------------------------------------------
UPDATE donors
SET sex = CASE WHEN random() < 0.5 THEN 'male' ELSE 'female' END
WHERE sex IS NULL
  AND donor_id IN (
    '8307d783-a64f-4e4c-9112-04500a6cc356', 'f9ec247d-5fc4-4548-b317-ca4afa5486a1', '1f79d275-f587-41a7-aca0-6c92616e2cbe', '5b7e2375-2d31-4aea-b549-2a9f3e5916c0', '098799eb-2500-45fe-8d2a-a8100f7be8de', 'ee73f53e-953a-4a96-8375-84c1e86f04a2',
    'a6ba8155-bdb6-4453-8ea3-c0a32510a804', 'fcc29793-1d94-4d27-ba31-a854c1b3f4e5', '1bd76d2f-744d-4cc6-a8f8-b38dae137e68', 'e907da67-48bf-459a-80f5-31815cc6e81e', '183de600-83b7-434f-a6f1-6a83898a734b', 'e29a27f9-721c-42c2-987f-7f3775a1de5a',
    'd89bdb24-a7a7-40e0-a794-16e3bfe0fb52', '46af632a-ff3c-441d-a6a9-3a0be9dd143a', '642cfe22-a580-49f0-9b6c-e2b8cedbc61d', '501b2947-8b75-4165-aabd-bd31fb6e9d80', '2a04f4bb-357b-4deb-a133-e99bc5bb1237', 'a683fee9-06b9-43bc-b320-6728ad873b56',
    '7ebd7714-751f-421c-8412-1591fb0b7133', '3eae7dda-3a19-4112-b324-057716b8e906', '23561448-e1e7-4ca8-b5b7-052e2e5b6574', '6be51557-b58a-4467-9698-004e6fa5607e', 'a477d5ae-6550-4c67-9e6b-9458b2941e7f', '492760da-2050-47ee-9b35-ef7b1844aaef',
    '67b28e18-13c0-407c-b84e-3c674977901d', '6d6e2329-16d3-42a0-b706-0799fbc927a3', '951758dc-cdbf-4fa3-95fb-caac9aeeedae', '9f336c9a-42ea-40ea-b538-a33fb345b09c', 'd7b92b16-6bab-4cca-bac1-a3b2d1fbed4f', '590d5fc3-68f3-4dc6-a465-12cd362feb76',
    '8543b032-7c43-4752-a28c-ef15833893d7', 'bea0ca60-59e7-4edc-9d95-977e75973bc1', 'b0c69251-95d0-4419-a203-b493155b743a', '22f4b157-1a1e-4084-9eec-779f5b30a0b0', '77f68a13-4504-41dc-abdc-e7b8bf4df1e4', 'a92f21cf-d7d4-42da-9d82-351fdd6c8901',
    '02cfb4b9-56e7-41d7-ae71-fa0ef346c271', '511784c9-e65b-4c86-9887-0a2e507c774b', 'f75201c1-e25e-4646-b73a-1d65bff941d5', '65fe869e-6ebb-460e-a70c-db44e0ed4bc5', '6fec49cd-8bbd-4656-8fe7-00e5b449c63f', '1608a133-8944-45ac-a200-1d2512d03d81',
    '6792ab35-fcb7-486b-a51a-192b974da98a', 'b053a986-c63a-42db-97a7-2550cc1db8ff', '47c40860-1f0b-4031-9d6d-ad6f2012cbfb', '809cf201-a9f6-4e00-b3b4-f1bf363f046b', 'f55f7ca4-468c-4bc4-8edc-048c8ab619ee', 'd92d478d-5f73-4bd4-93c5-9ec92bb5c003',
    '1d5112c6-7cc6-42ab-b511-5d2196514f19', '96317228-bd79-406c-81ce-a665df8f1bc0', '9186f676-4bb6-4638-866d-ea5e53a9341f', '7ad001df-ded4-4023-9b14-53c63163a279', '46783d4f-e94f-4184-a729-90a16a1d1559', '77d3baf8-62c7-445f-9ef7-9c97b34fa34a',
    'c9ea4600-ee3e-4211-b387-fdb116ef73aa', 'c043c928-a891-411d-adba-0e9115a3834c', '9dda625d-c823-4291-ade2-56e962fdd0f7', 'd192f60a-1f3d-4f20-b1db-f1a70d14f176', '873ffb53-5f65-47ef-83a9-3338f80e21dc', 'c906f0e6-eb63-477d-aa30-c1fc166bfb83',
    '1a898bb8-3ff6-4301-a1df-7bfd06e94a41', 'ca55e4ce-f78f-4006-9fe9-366ca4fc8e7c', 'eaa9d335-a09d-45eb-acb3-5d9bdfd9928c', 'da32fa9a-5228-4d90-bfec-0b7e99c60993', '5c8bdc71-57c5-467e-ab0d-c2492ede669e', 'dd654e59-f769-4d07-bf0a-e84e7fed83d8',
    '7841582b-e531-4c8b-be4e-e8a4c07f22c0', '0e08238e-7b56-4517-81cd-2369d91fb437', '0f086c56-ed2a-4f73-9853-a84b2177bf6b', '13dfccc3-9c02-4e66-ac1e-9a9ae490f104', '02129691-c98b-4f90-b924-36c185bbe978', 'b00def50-3cd5-4d3c-a096-049a5ffe7c21',
    'aab56259-1cab-4151-8b1b-16f58ddbd72c', '6f585b55-a273-4af8-857a-141556f76b47', '762a14dd-49d9-408a-85eb-450739384a69', '171d4b3b-250e-43a0-b19c-af91302f868e', 'c513792d-51a2-444d-b901-29afb2d528ff', '8c714611-0799-4378-a7e1-6310c4e548fd',
    'dbe72551-dafe-4113-ac27-6a156496466c', '827d8111-8a33-485b-8ed8-cef0fbdf9d1b', 'c7e6e656-372d-4d3f-915e-d793b8ac4056', 'cbbba24d-67bb-4c40-b07b-79a0d1562e8e', 'f72102a2-e98b-481a-854b-2c0b5c603dfa', 'a6787938-fe8e-4a85-9269-defc6736e73c',
    '2394ade9-6dc2-4042-9235-91534f256a73', 'fa9f2057-3212-4125-999d-c6b9c998d177', '54b012b0-0860-4cc9-8b49-ff4cd90f4a70', '029d52f4-b23a-46ac-83d5-40cb5db2b23f', '91116575-22c8-4ccf-bdb0-03e38252a7bd', 'ab085655-d52a-49b8-aa77-36c1e0209581',
    'de969bd1-0fab-4365-be64-eec9864cf274', 'cb2d47ed-4ed4-4bd8-8854-797518d86f34', 'b7361560-8d23-440d-bdf5-1e5f4b98968b', '2006ca5c-e760-4326-b7ff-672228c8d3ce', 'dd6dfa72-073b-4bee-b85e-df6114ff7f1b', 'e652fe17-aa67-4f3d-862d-b6bf864b6340',
    'ad57a30b-b7bf-4240-83a0-089ee1d301d1', '1485494b-92af-4df6-a2b3-ae8b5d6d95dc', '813eeee7-bb00-436d-bf0e-f30db66f993b', '5d6e0029-0a0c-4518-8f22-860d7ef2ad26', '386ee787-ae8c-4f52-be29-ce86ca89fe01', 'd03c2bea-bdb9-4e02-b069-6f866aef620d',
    'eda2ea8f-07a2-49f3-9f56-3559333ef61f', '02478849-d354-4d1c-9ef2-c866d4d368ca', '279bef6b-ebaa-4a4b-b6dd-9dfe0157eedc', '5430cafa-a7e4-4e34-85fc-ba46407b33d1', 'aaace6ec-62d3-427c-adb1-7f7522b0ee9d', '9c85637e-eba9-4121-98b4-bc3ff545ca93',
    'cd6868aa-2ed0-4b00-bf58-4ca35f004e54', 'f54de5c0-74dc-4eff-8938-878ef80a5219', 'f94f3835-71b5-4fb4-8e6a-b3f7cba492cb', '469b3a08-fdbb-47ea-8ac4-10921e04ac11', '62cad3e0-38de-4127-a75e-0762d78991d2', '155f96a9-b340-4acd-be0b-da048cda4af6',
    'cd3fbe9b-7c89-49b3-acd1-c244aad4ad47', 'ad1650ee-99a7-480c-8b46-db978b9ac1ed', '42d22d6a-1c53-4bbd-a62c-ca37de67b925', '52c3476b-adb1-4271-960b-fb664774b05e', '22642184-3d3d-47b3-bb80-f272979d6565', 'c1ebd549-ede4-4c94-90ab-b71ecc71ae55',
    '7cea8475-33fd-4174-ba12-a7139668e7a9', '3c5ed1a7-5f61-46df-9d68-afbec592db32', 'e2935b80-c3d7-4bf9-b584-a25f0b4ab4db', 'cd334a14-e979-4f0f-9997-41db4bb64f86', '55f09bf7-0cde-40e1-be0e-1403cb7e27e6', '96baef8c-1093-47d2-ad44-82dd589a5b63',
    '5b806179-70ca-4389-b5de-d96a2ace7c21', 'ec11b9c5-4505-4b78-91b0-588ffa3ce83f', 'c4e37de3-516a-4cfe-b3f3-feb9081ea0eb', '839c15f2-a0ea-4546-931d-25f4ffb0c66e', '3eddb902-486e-438f-9529-8f59bcc52310', 'f13da2e3-4a0b-4d1a-afd2-f0d8395d9df9',
    '9206d275-2be8-4479-a824-5bcd0a0f21bf', '4f752d8e-181c-448f-be99-9d4ba25630af', '35d42652-53f0-4fed-972e-f573edb6d604', '0f0e9ff8-13a3-4abe-adfe-94c8f9b614d3', 'bbf5631d-e81b-475e-b9a9-2117612bf61c', '4848febc-e1e1-4f90-824c-2e82a1a2aa17',
    'aa9096d3-6413-4065-bd30-5679cec4c554', '017d8ee4-a87f-4149-bd3a-fdc5b3155a78', '4eab3211-8b77-40bf-ae30-008c22b148a2', '812ad5ae-73e5-4570-8ec7-4ec0ed9e3b8d', '5f636512-5d31-4b13-9864-5a8cd8ca0862', '062b8749-b126-4ac9-9b7b-b85ba0310190',
    '5ef947fa-2556-42d1-b8af-1ee808d44a58', '1ef5a8eb-1945-4910-ae07-58a8cf7e027f', '26c583f6-f267-402f-b0b8-0fabc3d7cf25', '135f51bd-fdcd-414a-a1bc-996b1b77a7cc', '8e26bb4f-91ef-4984-9f22-92df0ee66499', 'cd958450-71da-4263-8aea-4f76642aaaf4',
    'af8fc869-8f3b-4e1f-9181-1511805647ed', 'e86e552a-8ed8-49c3-90e1-c4976dc308f8', 'd78e4581-11df-4425-bd43-2be1c0c3e24c', 'f5d9a899-116a-4e91-a725-6f39b5490d7b', '65118be1-75ac-45fb-a69d-eb79da77a374', '4b2a8e35-9047-4822-bc90-f7c00efc3998',
    'a114d905-5d41-444c-bbab-de92e7b84d53', '951ebe33-b0b1-49f2-8537-4f38b38a43b4', '25936258-1928-4fff-bc15-97c36011765a', '3d81e3f3-6433-44d3-9f37-68d7e06ce563', '896d712e-8ab0-456d-a1da-180e1a612101', '25cd7c49-e561-4fd6-b1d4-2e29796b457a',
    '6bab3eb1-5f49-43e5-967a-6187e351c4a2', '175661d8-e0c9-4d23-bb5d-ede687b81444', 'a47135e0-c1b7-4332-ad6a-0d2ad8138b86', '2cb7ce6d-380d-4ab4-8faf-752545bc9e53', '7a304cbc-0c75-4816-b6c5-cfe744cf77e8', 'ff649d87-329e-4d67-9118-ed4ffd1403d9',
    'c55b4502-7dfc-4ca5-a2f6-9e7409a786d6', '292317c1-9c5b-4b64-99b4-c75c84052415', 'a3b0a885-c8d2-4e85-bfff-7a43a70b7867', 'f3b490f6-f92f-4736-a36c-bd8b4615f3a0', '17c80d74-8269-417e-80e1-0a67cb4bd873', 'e064a6b8-571e-426f-b6cf-afd7e8b2e3fd',
    '6a7e5852-c828-4577-ac29-818e07d910f0', 'e0944593-27ab-462e-b794-5485cd9f1812', 'a9d56059-8d26-42ba-b820-7770afc44bfc', '9d9a99b0-be6e-4f66-9d49-08dd073344ae', 'ea112b8b-953c-4e2e-857a-301efbe27bbc', '966fa5f8-6d00-4a0f-9d3a-ac3549c7ba69',
    'e504a301-3405-463e-87db-6a60e9761343', 'b353514e-6ff0-4f7c-9d07-cac7a122849b', '8fecd8e5-b0d0-4893-a392-2a971b2c9321', '52e2e7eb-4eb6-4698-b16f-3fb5234597a5', '719b3ab4-2f1c-48df-8599-beaeb49d0499', '42f74702-cb1b-432a-993c-6ff3d770f607',
    '3af94917-c3b7-4544-8683-5396a4e4441f', '33802202-6c74-44b6-befb-588bb1cd5437', '5dea993f-75d0-4968-9e52-c6fd8f822dd4', '82eaf42b-30c5-45b2-a8c0-6a6139e4ef0b', 'c1ae6320-a3c7-4458-9c17-9d6717a21520', '70e86532-ebd7-4825-8398-60b6834e8f8f',
    '7577c535-7161-4ef2-a3dc-0c30b366c008', 'fcf7d494-8254-40b4-9145-3ce6062dc245', '0b4019d5-51c9-4b3a-a87d-07d48d268935', '72bede5d-500e-4555-bd85-110efa7ba9d9', '44fa2df8-0848-4a80-9da1-03b8b5bfeec6', '197fdfcd-6fa6-4f1e-bd74-ed2c064b8548',
    'caf68ae1-ba69-42c4-92ec-b27a1b4e9322', 'ddc841c0-7759-4b78-a8e6-28f859859b07'
);


-- ----------------------------------------------------------------------------
-- 2. Last donation component.
--
-- Weighted 70 / 20 / 10 across whole blood / platelets / plasma, reflecting
-- what this system models: NGO drives and hospital banks in Bangladesh
-- collect overwhelmingly whole blood, apheresis components far less. The
-- exact split is a plausible shape, not a measured one.
--
-- The mix is what makes the Donors column show a spread of real countdowns
-- rather than one repeated number, because the three cooldowns differ sharply:
--   whole blood -> 120 or 180 days before whole blood again, 28 before others
--   platelets   -> 7 days before whole blood or platelets, 28 before plasma
--   plasma      -> 28 days before anything
--
-- ONLY where a last_donation_date already exists. A component with no date
-- describes a donation that, as far as the database is concerned, never
-- happened.
--
-- The single random() lives in the subquery deliberately. Two random() calls
-- inside one CASE are two INDEPENDENT draws, which silently skews the
-- distribution away from the weights above -- a bug that produces
-- plausible-looking output and is never noticed.
-- ----------------------------------------------------------------------------
UPDATE donors d
SET last_donation_component = CASE
      WHEN t.r < 0.70 THEN 'whole_blood'
      WHEN t.r < 0.90 THEN 'platelets'
      ELSE 'plasma'
    END
FROM (SELECT donor_id, random() AS r FROM donors) t
WHERE d.donor_id = t.donor_id
  AND d.last_donation_component IS NULL
  AND d.last_donation_date IS NOT NULL
  AND d.donor_id IN (
    '8307d783-a64f-4e4c-9112-04500a6cc356', 'f9ec247d-5fc4-4548-b317-ca4afa5486a1', '1f79d275-f587-41a7-aca0-6c92616e2cbe', '5b7e2375-2d31-4aea-b549-2a9f3e5916c0', '098799eb-2500-45fe-8d2a-a8100f7be8de', 'ee73f53e-953a-4a96-8375-84c1e86f04a2',
    'a6ba8155-bdb6-4453-8ea3-c0a32510a804', 'fcc29793-1d94-4d27-ba31-a854c1b3f4e5', '1bd76d2f-744d-4cc6-a8f8-b38dae137e68', 'e907da67-48bf-459a-80f5-31815cc6e81e', '183de600-83b7-434f-a6f1-6a83898a734b', 'e29a27f9-721c-42c2-987f-7f3775a1de5a',
    'd89bdb24-a7a7-40e0-a794-16e3bfe0fb52', '46af632a-ff3c-441d-a6a9-3a0be9dd143a', '642cfe22-a580-49f0-9b6c-e2b8cedbc61d', '501b2947-8b75-4165-aabd-bd31fb6e9d80', '2a04f4bb-357b-4deb-a133-e99bc5bb1237', 'a683fee9-06b9-43bc-b320-6728ad873b56',
    '7ebd7714-751f-421c-8412-1591fb0b7133', '3eae7dda-3a19-4112-b324-057716b8e906', '23561448-e1e7-4ca8-b5b7-052e2e5b6574', '6be51557-b58a-4467-9698-004e6fa5607e', 'a477d5ae-6550-4c67-9e6b-9458b2941e7f', '492760da-2050-47ee-9b35-ef7b1844aaef',
    '67b28e18-13c0-407c-b84e-3c674977901d', '6d6e2329-16d3-42a0-b706-0799fbc927a3', '951758dc-cdbf-4fa3-95fb-caac9aeeedae', '9f336c9a-42ea-40ea-b538-a33fb345b09c', 'd7b92b16-6bab-4cca-bac1-a3b2d1fbed4f', '590d5fc3-68f3-4dc6-a465-12cd362feb76',
    '8543b032-7c43-4752-a28c-ef15833893d7', 'bea0ca60-59e7-4edc-9d95-977e75973bc1', 'b0c69251-95d0-4419-a203-b493155b743a', '22f4b157-1a1e-4084-9eec-779f5b30a0b0', '77f68a13-4504-41dc-abdc-e7b8bf4df1e4', 'a92f21cf-d7d4-42da-9d82-351fdd6c8901',
    '02cfb4b9-56e7-41d7-ae71-fa0ef346c271', '511784c9-e65b-4c86-9887-0a2e507c774b', 'f75201c1-e25e-4646-b73a-1d65bff941d5', '65fe869e-6ebb-460e-a70c-db44e0ed4bc5', '6fec49cd-8bbd-4656-8fe7-00e5b449c63f', '1608a133-8944-45ac-a200-1d2512d03d81',
    '6792ab35-fcb7-486b-a51a-192b974da98a', 'b053a986-c63a-42db-97a7-2550cc1db8ff', '47c40860-1f0b-4031-9d6d-ad6f2012cbfb', '809cf201-a9f6-4e00-b3b4-f1bf363f046b', 'f55f7ca4-468c-4bc4-8edc-048c8ab619ee', 'd92d478d-5f73-4bd4-93c5-9ec92bb5c003',
    '1d5112c6-7cc6-42ab-b511-5d2196514f19', '96317228-bd79-406c-81ce-a665df8f1bc0', '9186f676-4bb6-4638-866d-ea5e53a9341f', '7ad001df-ded4-4023-9b14-53c63163a279', '46783d4f-e94f-4184-a729-90a16a1d1559', '77d3baf8-62c7-445f-9ef7-9c97b34fa34a',
    'c9ea4600-ee3e-4211-b387-fdb116ef73aa', 'c043c928-a891-411d-adba-0e9115a3834c', '9dda625d-c823-4291-ade2-56e962fdd0f7', 'd192f60a-1f3d-4f20-b1db-f1a70d14f176', '873ffb53-5f65-47ef-83a9-3338f80e21dc', 'c906f0e6-eb63-477d-aa30-c1fc166bfb83',
    '1a898bb8-3ff6-4301-a1df-7bfd06e94a41', 'ca55e4ce-f78f-4006-9fe9-366ca4fc8e7c', 'eaa9d335-a09d-45eb-acb3-5d9bdfd9928c', 'da32fa9a-5228-4d90-bfec-0b7e99c60993', '5c8bdc71-57c5-467e-ab0d-c2492ede669e', 'dd654e59-f769-4d07-bf0a-e84e7fed83d8',
    '7841582b-e531-4c8b-be4e-e8a4c07f22c0', '0e08238e-7b56-4517-81cd-2369d91fb437', '0f086c56-ed2a-4f73-9853-a84b2177bf6b', '13dfccc3-9c02-4e66-ac1e-9a9ae490f104', '02129691-c98b-4f90-b924-36c185bbe978', 'b00def50-3cd5-4d3c-a096-049a5ffe7c21',
    'aab56259-1cab-4151-8b1b-16f58ddbd72c', '6f585b55-a273-4af8-857a-141556f76b47', '762a14dd-49d9-408a-85eb-450739384a69', '171d4b3b-250e-43a0-b19c-af91302f868e', 'c513792d-51a2-444d-b901-29afb2d528ff', '8c714611-0799-4378-a7e1-6310c4e548fd',
    'dbe72551-dafe-4113-ac27-6a156496466c', '827d8111-8a33-485b-8ed8-cef0fbdf9d1b', 'c7e6e656-372d-4d3f-915e-d793b8ac4056', 'cbbba24d-67bb-4c40-b07b-79a0d1562e8e', 'f72102a2-e98b-481a-854b-2c0b5c603dfa', 'a6787938-fe8e-4a85-9269-defc6736e73c',
    '2394ade9-6dc2-4042-9235-91534f256a73', 'fa9f2057-3212-4125-999d-c6b9c998d177', '54b012b0-0860-4cc9-8b49-ff4cd90f4a70', '029d52f4-b23a-46ac-83d5-40cb5db2b23f', '91116575-22c8-4ccf-bdb0-03e38252a7bd', 'ab085655-d52a-49b8-aa77-36c1e0209581',
    'de969bd1-0fab-4365-be64-eec9864cf274', 'cb2d47ed-4ed4-4bd8-8854-797518d86f34', 'b7361560-8d23-440d-bdf5-1e5f4b98968b', '2006ca5c-e760-4326-b7ff-672228c8d3ce', 'dd6dfa72-073b-4bee-b85e-df6114ff7f1b', 'e652fe17-aa67-4f3d-862d-b6bf864b6340',
    'ad57a30b-b7bf-4240-83a0-089ee1d301d1', '1485494b-92af-4df6-a2b3-ae8b5d6d95dc', '813eeee7-bb00-436d-bf0e-f30db66f993b', '5d6e0029-0a0c-4518-8f22-860d7ef2ad26', '386ee787-ae8c-4f52-be29-ce86ca89fe01', 'd03c2bea-bdb9-4e02-b069-6f866aef620d',
    'eda2ea8f-07a2-49f3-9f56-3559333ef61f', '02478849-d354-4d1c-9ef2-c866d4d368ca', '279bef6b-ebaa-4a4b-b6dd-9dfe0157eedc', '5430cafa-a7e4-4e34-85fc-ba46407b33d1', 'aaace6ec-62d3-427c-adb1-7f7522b0ee9d', '9c85637e-eba9-4121-98b4-bc3ff545ca93',
    'cd6868aa-2ed0-4b00-bf58-4ca35f004e54', 'f54de5c0-74dc-4eff-8938-878ef80a5219', 'f94f3835-71b5-4fb4-8e6a-b3f7cba492cb', '469b3a08-fdbb-47ea-8ac4-10921e04ac11', '62cad3e0-38de-4127-a75e-0762d78991d2', '155f96a9-b340-4acd-be0b-da048cda4af6',
    'cd3fbe9b-7c89-49b3-acd1-c244aad4ad47', 'ad1650ee-99a7-480c-8b46-db978b9ac1ed', '42d22d6a-1c53-4bbd-a62c-ca37de67b925', '52c3476b-adb1-4271-960b-fb664774b05e', '22642184-3d3d-47b3-bb80-f272979d6565', 'c1ebd549-ede4-4c94-90ab-b71ecc71ae55',
    '7cea8475-33fd-4174-ba12-a7139668e7a9', '3c5ed1a7-5f61-46df-9d68-afbec592db32', 'e2935b80-c3d7-4bf9-b584-a25f0b4ab4db', 'cd334a14-e979-4f0f-9997-41db4bb64f86', '55f09bf7-0cde-40e1-be0e-1403cb7e27e6', '96baef8c-1093-47d2-ad44-82dd589a5b63',
    '5b806179-70ca-4389-b5de-d96a2ace7c21', 'ec11b9c5-4505-4b78-91b0-588ffa3ce83f', 'c4e37de3-516a-4cfe-b3f3-feb9081ea0eb', '839c15f2-a0ea-4546-931d-25f4ffb0c66e', '3eddb902-486e-438f-9529-8f59bcc52310', 'f13da2e3-4a0b-4d1a-afd2-f0d8395d9df9',
    '9206d275-2be8-4479-a824-5bcd0a0f21bf', '4f752d8e-181c-448f-be99-9d4ba25630af', '35d42652-53f0-4fed-972e-f573edb6d604', '0f0e9ff8-13a3-4abe-adfe-94c8f9b614d3', 'bbf5631d-e81b-475e-b9a9-2117612bf61c', '4848febc-e1e1-4f90-824c-2e82a1a2aa17',
    'aa9096d3-6413-4065-bd30-5679cec4c554', '017d8ee4-a87f-4149-bd3a-fdc5b3155a78', '4eab3211-8b77-40bf-ae30-008c22b148a2', '812ad5ae-73e5-4570-8ec7-4ec0ed9e3b8d', '5f636512-5d31-4b13-9864-5a8cd8ca0862', '062b8749-b126-4ac9-9b7b-b85ba0310190',
    '5ef947fa-2556-42d1-b8af-1ee808d44a58', '1ef5a8eb-1945-4910-ae07-58a8cf7e027f', '26c583f6-f267-402f-b0b8-0fabc3d7cf25', '135f51bd-fdcd-414a-a1bc-996b1b77a7cc', '8e26bb4f-91ef-4984-9f22-92df0ee66499', 'cd958450-71da-4263-8aea-4f76642aaaf4',
    'af8fc869-8f3b-4e1f-9181-1511805647ed', 'e86e552a-8ed8-49c3-90e1-c4976dc308f8', 'd78e4581-11df-4425-bd43-2be1c0c3e24c', 'f5d9a899-116a-4e91-a725-6f39b5490d7b', '65118be1-75ac-45fb-a69d-eb79da77a374', '4b2a8e35-9047-4822-bc90-f7c00efc3998',
    'a114d905-5d41-444c-bbab-de92e7b84d53', '951ebe33-b0b1-49f2-8537-4f38b38a43b4', '25936258-1928-4fff-bc15-97c36011765a', '3d81e3f3-6433-44d3-9f37-68d7e06ce563', '896d712e-8ab0-456d-a1da-180e1a612101', '25cd7c49-e561-4fd6-b1d4-2e29796b457a',
    '6bab3eb1-5f49-43e5-967a-6187e351c4a2', '175661d8-e0c9-4d23-bb5d-ede687b81444', 'a47135e0-c1b7-4332-ad6a-0d2ad8138b86', '2cb7ce6d-380d-4ab4-8faf-752545bc9e53', '7a304cbc-0c75-4816-b6c5-cfe744cf77e8', 'ff649d87-329e-4d67-9118-ed4ffd1403d9',
    'c55b4502-7dfc-4ca5-a2f6-9e7409a786d6', '292317c1-9c5b-4b64-99b4-c75c84052415', 'a3b0a885-c8d2-4e85-bfff-7a43a70b7867', 'f3b490f6-f92f-4736-a36c-bd8b4615f3a0', '17c80d74-8269-417e-80e1-0a67cb4bd873', 'e064a6b8-571e-426f-b6cf-afd7e8b2e3fd',
    '6a7e5852-c828-4577-ac29-818e07d910f0', 'e0944593-27ab-462e-b794-5485cd9f1812', 'a9d56059-8d26-42ba-b820-7770afc44bfc', '9d9a99b0-be6e-4f66-9d49-08dd073344ae', 'ea112b8b-953c-4e2e-857a-301efbe27bbc', '966fa5f8-6d00-4a0f-9d3a-ac3549c7ba69',
    'e504a301-3405-463e-87db-6a60e9761343', 'b353514e-6ff0-4f7c-9d07-cac7a122849b', '8fecd8e5-b0d0-4893-a392-2a971b2c9321', '52e2e7eb-4eb6-4698-b16f-3fb5234597a5', '719b3ab4-2f1c-48df-8599-beaeb49d0499', '42f74702-cb1b-432a-993c-6ff3d770f607',
    '3af94917-c3b7-4544-8683-5396a4e4441f', '33802202-6c74-44b6-befb-588bb1cd5437', '5dea993f-75d0-4968-9e52-c6fd8f822dd4', '82eaf42b-30c5-45b2-a8c0-6a6139e4ef0b', 'c1ae6320-a3c7-4458-9c17-9d6717a21520', '70e86532-ebd7-4825-8398-60b6834e8f8f',
    '7577c535-7161-4ef2-a3dc-0c30b366c008', 'fcf7d494-8254-40b4-9145-3ce6062dc245', '0b4019d5-51c9-4b3a-a87d-07d48d268935', '72bede5d-500e-4555-bd85-110efa7ba9d9', '44fa2df8-0848-4a80-9da1-03b8b5bfeec6', '197fdfcd-6fa6-4f1e-bd74-ed2c064b8548',
    'caf68ae1-ba69-42c4-92ec-b27a1b4e9322', 'ddc841c0-7759-4b78-a8e6-28f859859b07'
);


-- ----------------------------------------------------------------------------
-- 3. VERIFY.
--
-- `properly_computable` should go from 12 to about 155.
-- `reads_as_fully_eligible` falls correspondingly. It will NOT reach zero and
-- should not: seed donors with no donation date are genuinely eligible for
-- everything, which is the right answer for someone who has never donated.
-- `real_donors_untouched` must still be 4 -- those are the no-name real rows
-- rev 1 would have overwritten.
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*)                                                                      AS donors_total,
  COUNT(*) FILTER (WHERE last_donation_date IS NULL OR last_donation_component IS NULL)
                                                                                AS reads_as_fully_eligible,
  COUNT(*) FILTER (WHERE last_donation_date IS NOT NULL AND last_donation_component IS NOT NULL)
                                                                                AS properly_computable,
  COUNT(*) FILTER (WHERE sex = 'male')                                          AS male,
  COUNT(*) FILTER (WHERE sex = 'female')                                        AS female,
  COUNT(*) FILTER (WHERE sex IS NULL)                                           AS sex_still_null,
  COUNT(*) FILTER (WHERE last_donation_component = 'whole_blood')               AS last_gave_whole_blood,
  COUNT(*) FILTER (WHERE last_donation_component = 'platelets')                 AS last_gave_platelets,
  COUNT(*) FILTER (WHERE last_donation_component = 'plasma')                    AS last_gave_plasma,
  COUNT(*) FILTER (WHERE full_name IS NULL
                     AND (phone_number IS NOT NULL
                       OR current_district IS NOT NULL
                       OR user_id IS NOT NULL))                                 AS real_donors_untouched
FROM donors;


-- ----------------------------------------------------------------------------
-- 4. What the Donors page will now show. The day counts here use the same
--    constants services/eligibility.js uses, so the two should agree row for
--    row. A good spot-check against the UI once the frontend is deployed.
-- ----------------------------------------------------------------------------
SELECT d.blood_type, d.sex, d.last_donation_component, d.last_donation_date,
       GREATEST(0, (d.last_donation_date + (CASE
           WHEN d.last_donation_component = 'whole_blood'
             THEN CASE WHEN d.sex = 'male' THEN 120 ELSE 180 END
           WHEN d.last_donation_component = 'platelets' THEN 7
           ELSE 28 END) * INTERVAL '1 day')::date - CURRENT_DATE) AS days_until_whole_blood
FROM donors d
WHERE d.last_donation_date IS NOT NULL
  AND d.last_donation_component IS NOT NULL
ORDER BY days_until_whole_blood DESC
LIMIT 20;