-- Remove board-era fallback copy from imported fulfilled wishes.

update public.wishes
set thank_you_message = 'Granted from the wish conversation.'
where thank_you_message = 'Granted from a support thread.';
