CREATE TABLE IF NOT EXISTS termination_reason_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_terminations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
  last_working_day TEXT NOT NULL,
  termination_type TEXT NOT NULL CHECK (termination_type IN ('resignation','mutual_agreement','involuntary','project_completion')),
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  rehire_eligible INTEGER NOT NULL DEFAULT 0,
  task_transfer_employee_id INTEGER REFERENCES employees(id),
  terminated_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS employee_terminations_last_day_idx ON employee_terminations(last_working_day);

CREATE TABLE IF NOT EXISTS leave_request_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  leave_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount IN (0, 0.5, 1)),
  UNIQUE (request_id, leave_date)
);
CREATE INDEX IF NOT EXISTS leave_request_days_date_idx ON leave_request_days(leave_date);

INSERT OR IGNORE INTO termination_reason_catalog(code,label,sort_order) VALUES
  ('workload','Велике навантаження в роботі',10),
  ('another_company','Вибір іншої компанії',20),
  ('career_change','Зміна напряму діяльності',30),
  ('stress','Високий рівень стресу',40),
  ('no_growth','Відсутність перспективи карʼєрного зростання',50),
  ('no_recognition','Відсутність похвали та заохочень',60),
  ('management_communication','Відсутність спілкування з керівництвом',70),
  ('team_conflict','Конфлікти в колективі',80),
  ('role_mismatch','Посада не відповідає очікуванням',90),
  ('low_salary','Недостатня заробітна плата',100),
  ('performance','Незадовільний перформанс',110),
  ('commute','Незручно добиратися до роботи',120),
  ('expectations','Очікування співробітника не виправдалися',130),
  ('relocation','Переїзд в іншу країну',140),
  ('project_closed','Закриття проєкту',150),
  ('low_productivity','Низька продуктивність',160);
