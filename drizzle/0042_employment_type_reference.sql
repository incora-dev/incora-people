ALTER TABLE employees ADD COLUMN employment_type_value_id INTEGER REFERENCES reference_values(id);
