-- YurCore Learning: course rating aggregates.
--
-- Read-only and additive: creates one function, changes no table and touches no data. Ratings come from the
-- existing course feedback table (one row per learner per course, rating 1-5 enforced by its check constraint),
-- so a submitted, revised or deleted feedback is reflected on the next read with no stored aggregate to keep in
-- sync. Counting happens in the database, so card lists make one call for the whole batch and are never cut short
-- by the API row limit. The (course_id, user_id) unique index on the feedback table serves the lookup.

begin;

create or replace function public.meyveda_learning_course_ratings(p_course_ids uuid[])
returns table (
  course_id    uuid,
  rating_count integer,
  rating_sum   integer,
  stars_1      integer,
  stars_2      integer,
  stars_3      integer,
  stars_4      integer,
  stars_5      integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  select f.course_id,
         count(*)::integer,
         sum(f.rating)::integer,
         count(*) filter (where f.rating = 1)::integer,
         count(*) filter (where f.rating = 2)::integer,
         count(*) filter (where f.rating = 3)::integer,
         count(*) filter (where f.rating = 4)::integer,
         count(*) filter (where f.rating = 5)::integer
    from public.meyveda_learning_course_feedback f
    join public.users u on u.id = f.user_id and coalesce(u.is_active, true)
   where f.course_id = any(p_course_ids)
     and f.rating between 1 and 5
   group by f.course_id
$$;

revoke all on function public.meyveda_learning_course_ratings(uuid[]) from public, anon, authenticated;
grant execute on function public.meyveda_learning_course_ratings(uuid[]) to service_role;

commit;

notify pgrst, 'reload schema';
