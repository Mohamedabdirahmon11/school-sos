-- Correct empty classes explicitly named Grade 1 that were accidentally
-- stored with KG's numeric level (0). Never change a class with enrolled students.
BEGIN;

UPDATE public.classes AS c
   SET grade_level = 1
 WHERE c.grade_level = 0
   AND c.name ~* '^grade[[:space:]]*1$'
   AND NOT EXISTS (
     SELECT 1
       FROM public.students AS s
      WHERE s.school_id = c.school_id
        AND s.class_id = c.id
   );

COMMIT;
