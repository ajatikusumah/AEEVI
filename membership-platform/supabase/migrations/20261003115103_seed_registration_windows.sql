-- Seed AEEVI's regular registration windows for 2027–2030.
-- Indonesia time is UTC+07:00. Closing timestamps are exclusive:
-- Jan 1–30 closes at Jan 31 00:00; Jun 1–30 closes at Jul 1 00:00.
-- Edit the year range before applying if project setup occurs after 2030.
insert into public.registration_windows
  (calendar_year, period, opens_at, closes_at, is_enabled)
select y.calendar_year,
       'january',
       make_timestamptz(y.calendar_year, 1, 1, 0, 0, 0, 'Asia/Jakarta'),
       make_timestamptz(y.calendar_year, 1, 31, 0, 0, 0, 'Asia/Jakarta'),
       true
from generate_series(2027, 2030) as y(calendar_year)
union all
select y.calendar_year,
       'june',
       make_timestamptz(y.calendar_year, 6, 1, 0, 0, 0, 'Asia/Jakarta'),
       make_timestamptz(y.calendar_year, 7, 1, 0, 0, 0, 'Asia/Jakarta'),
       true
from generate_series(2027, 2030) as y(calendar_year)
on conflict (calendar_year, period) do nothing;
