-- Rename the "Pre-Meeting Elevator Pitch" survey to "Monthly Check-in"
UPDATE public.surveys
SET title = 'Monthly Check-in'
WHERE title = 'Pre-Meeting Elevator Pitch';
