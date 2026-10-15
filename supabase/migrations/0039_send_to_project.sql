-- Sprint 35: one invoker RPC. Source data is read here, never trusted from a
-- browser payload. An error (including a duplicate) rolls back the entire batch,
-- the fallback work package, meeting link and trigger-written events together.
begin;
create function public.send_to_project(
  p_meeting_id uuid, p_project_id uuid, p_items jsonb, p_work_package_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  meeting_row public.meetings%rowtype;
  review_row public.post_meeting_reviews%rowtype;
  gap_row public.workflow_gaps%rowtype;
  mismatch_row public.contradiction_candidates%rowtype;
  run_row public.ai_run_logs%rowtype;
  entry jsonb;
  item jsonb;
  src_type text;
  src_id uuid;
  src_key text;
  item_title text;
  item_detail text;
  quote text;
  certainty_value text;
  rec_type text;
  confidence_value text;
  target text;
  raid_kind text;
  array_name text;
  array_index integer;
  package_id uuid := p_work_package_id;
  inserted_id uuid;
  task_ids jsonb := '[]';
  package_ids jsonb := '[]';
  raid_ids jsonb := '[]';
  has_decision boolean := false;
begin
  if public.current_user_role() is distinct from 'owner' then
    raise exception 'Owner role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Select a batch of source items' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Select between 1 and 100 items' using errcode = '22023';
  end if;
  select * into meeting_row from public.meetings where id = p_meeting_id for update;
  if not found then raise exception 'Meeting not found' using errcode = '22023'; end if;
  -- Serializes fallback creation, including simultaneous sends from different meetings.
  perform 1 from public.projects where id = p_project_id and archived_at is null for update;
  if not found then raise exception 'Choose an active project' using errcode = '22023'; end if;
  if package_id is not null then
    perform 1 from public.work_packages where id = package_id and project_id = p_project_id and archived_at is null;
    if not found then raise exception 'Choose an active work package on this project' using errcode = '22023'; end if;
  end if;
  for entry in select value from jsonb_array_elements(p_items) loop
    src_type := entry ->> 'source_type'; src_id := (entry ->> 'source_item_id')::uuid;
    src_key := nullif(entry ->> 'source_item_key', '');
    item_title := null; item_detail := null; quote := null;
    certainty_value := 'unknown'; rec_type := null; confidence_value := null; raid_kind := null;
    if src_id is null then raise exception 'Source item is required' using errcode = '22023'; end if;
    if src_type in ('followup', 'open_question', 'risk') or (src_type = 'recommendation' and src_key = 'build_direction') then
      select * into review_row from public.post_meeting_reviews where meeting_id = p_meeting_id
        order by generated_at desc, id desc limit 1;
      if review_row.id is distinct from src_id then raise exception 'Review changed; refresh before sending' using errcode = '22023'; end if;
      if src_type = 'recommendation' then
        target := 'raid'; raid_kind := 'decision'; certainty_value := 'inferred';
        item := review_row.build_direction_assessment;
        if nullif(btrim(item ->> 'assessment'), '') is null then raise exception 'Build direction assessment not found' using errcode = '22023'; end if;
        item_title := 'Build direction: ' || coalesce(item ->> 'status', 'assessment');
        item_detail := concat_ws(E'\n', item ->> 'assessment', nullif(item ->> 'recommendedReframe', ''));
      else
        array_name := case src_type when 'followup' then 'recommended_followups' when 'open_question' then 'open_questions' else 'risks' end;
        if src_key is null or src_key !~ ('^' || array_name || ':[0-9]+$') then
          raise exception 'Invalid source item key' using errcode = '22023';
        end if;
        array_index := split_part(src_key, ':', 2)::integer;
        item := to_jsonb(review_row) -> array_name -> array_index;
        if item is null then raise exception 'Source item no longer exists' using errcode = '22023'; end if;
        if src_type = 'followup' then target := 'task'; item_title := item ->> 'topic'; item_detail := item ->> 'question';
        elsif src_type = 'open_question' then target := 'task'; item_title := item ->> 'question'; item_detail := item ->> 'whyItMatters';
        else target := 'raid'; raid_kind := 'risk'; certainty_value := 'inferred'; item_title := item ->> 'risk'; item_detail := item ->> 'reason'; end if;
      end if;
    elsif src_type = 'workflow_gap' then
      select g.* into gap_row from public.workflow_gaps g join public.workflows w on w.id = g.workflow_id
        where g.id = src_id and w.meeting_id = p_meeting_id;
      if not found or src_key is not null then raise exception 'Workflow gap not found' using errcode = '22023'; end if;
      target := 'task'; item_title := gap_row.label; item_detail := gap_row.description;
      quote := gap_row.source_quote; certainty_value := gap_row.evidence_type::text;
    elsif src_type = 'mismatch' then
      select * into mismatch_row from public.contradiction_candidates where id = src_id and meeting_id = p_meeting_id;
      if not found or src_key is not null then raise exception 'Possible mismatch not found' using errcode = '22023'; end if;
      target := 'raid'; raid_kind := 'issue'; certainty_value := 'inferred';
      item_title := 'Needs clarification: ' || mismatch_row.label;
      item_detail := concat_ws(E'\n', mismatch_row.description, mismatch_row.suggested_clarification_question);
      quote := nullif(concat_ws(E'\n', case when nullif(mismatch_row.source_quote_a, '') is not null then 'A: ' || mismatch_row.source_quote_a end,
        case when nullif(mismatch_row.source_quote_b, '') is not null then 'B: ' || mismatch_row.source_quote_b end), '');
    elsif src_type in ('recommendation', 'experiment') then
      if meeting_row.meeting_type::text <> 'applied_ai_discovery' then raise exception 'No Applied AI assessment for this meeting' using errcode = '22023'; end if;
      select * into run_row from public.ai_run_logs where meeting_id = p_meeting_id
        and run_type = 'applied_ai_opportunity_assessment' and status in ('succeeded', 'retry_succeeded')
        order by created_at desc, id desc limit 1;
      if run_row.id is distinct from src_id then raise exception 'Assessment changed; refresh before sending' using errcode = '22023'; end if;
      item := run_row.output;
      select nullif(string_agg(e.value ->> 'quote', E'\n' order by e.ordinality), '') into quote
        from jsonb_array_elements(coalesce(item -> 'supportingEvidence', '[]')) with ordinality e(value, ordinality)
        where nullif(e.value ->> 'quote', '') is not null;
      certainty_value := 'inferred';
      if src_type = 'experiment' and src_key = 'smallest_useful_experiment' then
        target := 'package'; item_title := left(item ->> 'smallestUsefulExperiment', 500); item_detail := item ->> 'smallestUsefulExperiment';
      elsif src_type = 'recommendation' and src_key = 'applied_ai_recommendation' then
        target := 'raid'; raid_kind := 'decision'; rec_type := item ->> 'recommendationType'; confidence_value := item ->> 'confidence';
        item_title := replace(rec_type, '_', ' ');
        select string_agg(r.value, E'\n' order by r.ordinality) into item_detail
          from jsonb_array_elements_text(coalesce(item -> 'reasoning', '[]')) with ordinality r(value, ordinality);
      else raise exception 'Invalid assessment source key' using errcode = '22023'; end if;
    else raise exception 'Unsupported source item' using errcode = '22023'; end if;
    if nullif(btrim(item_title), '') is null then raise exception 'Source item has no title' using errcode = '22023'; end if;
    item_title := coalesce(nullif(btrim(entry ->> 'title'), ''), item_title);
    -- Preserve soft mismatch wording even after a title edit.
    if src_type = 'mismatch' and item_title not ilike 'Needs clarification:%' then item_title := 'Needs clarification: ' || item_title; end if;
    if length(item_title) > 20000 then raise exception 'Title is too long' using errcode = '22023'; end if;
    certainty_value := coalesce(nullif(entry ->> 'certainty', ''), certainty_value);
    if certainty_value not in ('known', 'inferred', 'unknown') then raise exception 'Invalid certainty' using errcode = '22023'; end if;
    if target = 'task' then
      if package_id is null then
        select id into package_id from public.work_packages where project_id = p_project_id
          and name = 'Discovery follow-ups' and archived_at is null order by created_at, id limit 1;
        if package_id is null then
          insert into public.work_packages (project_id, name) values (p_project_id, 'Discovery follow-ups') returning id into package_id;
        end if;
      end if;
      insert into public.tasks (work_package_id, title, notes, source_type, source_meeting_id, source_item_id, source_item_key, evidence_quote, certainty, sort_order)
        values (package_id, item_title, item_detail, src_type, p_meeting_id, src_id, src_key, quote, certainty_value,
          (select coalesce(max(sort_order) + 1, 0) from public.tasks where work_package_id = package_id)) returning id into inserted_id;
      task_ids := task_ids || jsonb_build_array(inserted_id);
    elsif target = 'package' then
      insert into public.work_packages (project_id, name, acceptance_criteria, source_type, source_meeting_id, source_item_id, source_item_key, evidence_quote, certainty, sort_order)
        values (p_project_id, item_title, item_detail, src_type, p_meeting_id, src_id, src_key, quote, certainty_value,
          (select coalesce(max(sort_order) + 1, 0) from public.work_packages where project_id = p_project_id)) returning id into inserted_id;
      package_ids := package_ids || jsonb_build_array(inserted_id);
    else
      insert into public.raid_items (project_id, kind, title, detail, recommendation_type, confidence, source_type, source_meeting_id, source_item_id, source_item_key, evidence_quote, certainty)
        values (p_project_id, raid_kind, item_title, item_detail, rec_type, confidence_value, src_type, p_meeting_id, src_id, src_key, quote, certainty_value) returning id into inserted_id;
      raid_ids := raid_ids || jsonb_build_array(inserted_id);
      has_decision := has_decision or raid_kind = 'decision';
    end if;
  end loop;
  update public.meetings set project_id = p_project_id where id = p_meeting_id and project_id is null;
  return jsonb_build_object('project_id', p_project_id, 'tasks', task_ids, 'work_packages', package_ids, 'raid_items', raid_ids, 'has_decision', has_decision);
end;
$$;
revoke all on function public.send_to_project(uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function public.send_to_project(uuid, uuid, jsonb, uuid) to authenticated;
commit;
