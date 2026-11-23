DELETE FROM employee_profile_records
WHERE kind = 'skill'
  AND reference_value_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM employee_profile_records
    WHERE kind = 'skill' AND reference_value_id IS NOT NULL
    GROUP BY employee_id, reference_value_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS employee_profile_records_employee_technology_unique
  ON employee_profile_records (employee_id, reference_value_id)
  WHERE kind = 'skill' AND reference_value_id IS NOT NULL;
