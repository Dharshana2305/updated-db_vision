export interface SampleDatabaseDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  databaseType: 'sqlite';
  schemaSql: string;
}

export const SAMPLE_DATABASES: SampleDatabaseDefinition[] = [
  {
    id: 'sample-ecommerce',
    name: 'Retail & E-Commerce Platform',
    category: 'E-Commerce',
    description: 'A multi-table online retail system with users, orders, inventory, payments, and product reviews. Contains real-world indexing gaps, plaintext password fields, PII exposures, and 1NF/2NF redundancy.',
    databaseType: 'sqlite',
    schemaSql: `
-- E-Commerce Database Schema with realistic production issues

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL,
  pwd VARCHAR(100) NOT NULL, -- Security: Plaintext password naming & pattern
  phone_number VARCHAR(30), -- Inconsistent formats
  ssn VARCHAR(20), -- Security: PII identification number
  street_address VARCHAR(200),
  city VARCHAR(50),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(100) NOT NULL,
  parent_id INTEGER,
  description TEXT
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  stock_qty INTEGER DEFAULT 0,
  category_id INTEGER,
  tags VARCHAR(255), -- 1NF violation: Comma-separated list
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, -- Performance: Missing index on critical foreign key
  order_number VARCHAR(50) UNIQUE NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(30) DEFAULT 'PENDING',
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  shipping_address TEXT,
  internal_notes TEXT, -- Quality: High null percentage
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL, -- Redundancy: Derived column (quantity * unit_price)
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  card_number VARCHAR(25), -- Security: Plaintext Credit Card PII
  card_cvv VARCHAR(4), -- Security: Critical PCI violation
  amount DECIMAL(10,2) NOT NULL,
  payment_status VARCHAR(30) NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER CHECK(rating >= 1 AND rating <= 5),
  comment_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Table without primary key (Structural defect)
CREATE TABLE activity_log (
  user_id INTEGER,
  action_type VARCHAR(50),
  action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45)
);

-- Seed Realistic Data
INSERT INTO categories (name, parent_id, description) VALUES
  ('Electronics', NULL, 'Consumer electronics and devices'),
  ('Laptops & Computers', 1, 'Notebooks, PCs, and workstations'),
  ('Smartphones & Audio', 1, 'Mobile phones and noise-cancelling headphones'),
  ('Home Appliances', NULL, 'Kitchen and living space gadgets');

INSERT INTO users (username, email, pwd, phone_number, ssn, street_address, city, state, postal_code) VALUES
  ('alex_turner', 'alex.turner@gmail.com', 'alexPass2026!', '+1-555-0144', '123-45-6789', '742 Evergreen Terrace', 'Springfield', 'OR', '97477'),
  ('priya_sharma', 'priya.sharma@example.co.in', 'priya#secure99', '9876543210', '987-65-4321', 'Flat 402, Lotus Gardens', 'Bangalore', 'KA', '560001'),
  ('marcus_vance', 'bad-email-format-marcus@', 'password123', '555-1234', '333-22-1111', '12 Baker Street', 'London', 'UK', 'NW1 6XE'),
  ('sara_connor', 'sara.c@cyberdyne.org', 'hunter2', '+1 (555) 998-1122', '456-78-9012', 'PO Box 883', 'Los Angeles', 'CA', '90001'),
  ('david_miller', 'david.miller@domain.com', 'Welcome@2024', '+44 20 7946 0912', '555-88-9999', '44 Broadway St', 'New York', 'NY', '10004');

INSERT INTO products (title, description, price, stock_qty, category_id, tags, is_active) VALUES
  ('UltraBook Pro 15', 'Lightweight performance laptop with 16GB RAM and 512GB NVMe SSD.', 1299.99, 45, 2, 'ultrabook,laptop,intel,workstation', 1),
  ('Wireless ANC Headphones', 'Premium over-ear noise-cancelling audio headset with 30h battery.', 249.50, 120, 3, 'audio,bluetooth,anc,music', 1),
  ('Ergonomic Mechanical Keyboard', 'RGB backlight with hot-swappable brown tactile switches.', 89.99, 85, 2, 'keyboard,gaming,ergonomic,pc', 1),
  ('Smart 4K OLED Monitor 32"', 'Vivid HDR1000 display with USB-C 90W power delivery.', 649.00, 15, 2, 'display,monitor,4k,gaming', 1),
  ('Smart Air Purifier HEPA', 'Smart IoT air cleaner with dual real-time particulate filtration.', 179.95, 30, 4, 'appliances,home,health,smart', 1);

INSERT INTO orders (user_id, order_number, total_amount, status, shipping_address, internal_notes) VALUES
  (1, 'ORD-2026-001', 1299.99, 'DELIVERED', '742 Evergreen Terrace, Springfield, OR', 'Customer requested contactless delivery.'),
  (1, 'ORD-2026-002', 339.49, 'PROCESSING', '742 Evergreen Terrace, Springfield, OR', NULL),
  (2, 'ORD-2026-003', 249.50, 'DELIVERED', 'Flat 402, Lotus Gardens, Bangalore', 'Gift wrap requested.'),
  (4, 'ORD-2026-004', 738.99, 'SHIPPED', 'PO Box 883, Los Angeles, CA', NULL),
  (5, 'ORD-2026-005', 89.99, 'PENDING', '44 Broadway St, New York, NY', NULL);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal) VALUES
  (1, 1, 1, 1299.99, 1299.99),
  (2, 2, 1, 249.50, 249.50),
  (2, 3, 1, 89.99, 89.99),
  (3, 2, 1, 249.50, 249.50),
  (4, 4, 1, 649.00, 649.00),
  (4, 3, 1, 89.99, 89.99),
  (5, 3, 1, 89.99, 89.99);

INSERT INTO payments (order_id, payment_method, card_number, card_cvv, amount, payment_status) VALUES
  (1, 'CREDIT_CARD', '4111-2222-3333-4444', '123', 1299.99, 'COMPLETED'),
  (2, 'CREDIT_CARD', '5500-0000-0000-1111', '456', 339.49, 'COMPLETED'),
  (3, 'UPI', 'UPI-TRANS-9812481', '000', 249.50, 'COMPLETED'),
  (4, 'CREDIT_CARD', '3782-8224-6310-0051', '789', 738.99, 'COMPLETED'),
  (5, 'CREDIT_CARD', '4000-1234-5678-9010', '999', 89.99, 'PENDING');

INSERT INTO reviews (product_id, user_id, rating, comment_text) VALUES
  (1, 1, 5, 'Superb build quality and keyboard feel! Excellent battery life.'),
  (2, 2, 4, 'Noise cancelling is top-tier. Bass could be slightly punchier.'),
  (3, 4, 5, 'Tactile feel is great for typing all day without fatigue.'),
  (4, 5, 2, 'Color calibration out of the box was slightly warm. Needed manual tweaking.');

INSERT INTO activity_log (user_id, action_type, ip_address) VALUES
  (1, 'LOGIN', '192.168.1.10'),
  (1, 'VIEW_PRODUCT', '192.168.1.10'),
  (1, 'CHECKOUT', '192.168.1.10'),
  (2, 'LOGIN', '10.0.0.15'),
  (3, 'FAILED_LOGIN', '172.16.0.4');
`
  },
  {
    id: 'sample-healthcare',
    name: 'Hospital Management & EHR System',
    category: 'Healthcare',
    description: 'Electronic Health Record (EHR) database covering patients, physicians, appointments, clinical notes, and billing. Ideal for demonstrating PII/HIPAA compliance detection, medical entity relationships, and indexing.',
    databaseType: 'sqlite',
    schemaSql: `
CREATE TABLE patients (
  patient_id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(10),
  national_id_number VARCHAR(30) NOT NULL, -- PII / Sensitive Identity
  phone_number VARCHAR(25),
  email VARCHAR(100),
  blood_group VARCHAR(5),
  emergency_contact VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE doctors (
  doctor_id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name VARCHAR(100) NOT NULL,
  specialization VARCHAR(100) NOT NULL,
  license_number VARCHAR(50) UNIQUE NOT NULL,
  contact_email VARCHAR(100) NOT NULL,
  department VARCHAR(50) NOT NULL
);

CREATE TABLE appointments (
  appointment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  doctor_id INTEGER NOT NULL,
  appointment_date TIMESTAMP NOT NULL,
  reason_for_visit TEXT,
  status VARCHAR(20) DEFAULT 'SCHEDULED',
  FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id)
);

CREATE TABLE medical_records (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  diagnosis_code VARCHAR(20),
  clinical_notes TEXT,
  prescribed_medications TEXT, -- 1NF violation: Comma-separated medicines
  follow_up_recommended INTEGER DEFAULT 0,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
);

CREATE TABLE patient_bills (
  bill_id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  appointment_id INTEGER,
  insurance_policy_number VARCHAR(50), -- Sensitive PII
  total_amount DECIMAL(10,2) NOT NULL,
  insurance_coverage DECIMAL(10,2) DEFAULT 0.00,
  patient_copay DECIMAL(10,2) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'UNPAID',
  bill_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
);

-- Seed Data
INSERT INTO doctors (full_name, specialization, license_number, contact_email, department) VALUES
  ('Dr. Sarah Jenkins', 'Cardiology', 'MD-CARD-8831', 's.jenkins@generalhospital.org', 'Cardiology'),
  ('Dr. Arun Patel', 'Neurology', 'MD-NEUR-4192', 'a.patel@generalhospital.org', 'Neurology'),
  ('Dr. Elena Rostova', 'Orthopedics', 'MD-ORTH-1904', 'e.rostova@generalhospital.org', 'Orthopedic Surgery');

INSERT INTO patients (first_name, last_name, date_of_birth, gender, national_id_number, phone_number, email, blood_group, emergency_contact) VALUES
  ('Robert', 'Chen', '1982-04-12', 'Male', 'SSN-901-22-4411', '555-0177', 'rchen@domain.com', 'O+', 'Wife: Alice Chen (555-0178)'),
  ('Meera', 'Nair', '1990-11-23', 'Female', 'SSN-334-11-8877', '+91-9845012345', 'meera.n@example.com', 'B+', 'Brother: Anand (9845012346)'),
  ('Thomas', 'Gomez', '1975-08-30', 'Male', 'SSN-112-99-0012', '555-9082', 'tgomez_invalid_email', 'A-', 'Son: Leo (555-9083)');

INSERT INTO appointments (patient_id, doctor_id, appointment_date, reason_for_visit, status) VALUES
  (1, 1, '2026-09-12 10:00:00', 'Routine cardiac stress assessment and ECG check', 'COMPLETED'),
  (2, 2, '2026-09-14 11:30:00', 'Chronic migraine headache consultation', 'SCHEDULED'),
  (3, 3, '2026-09-15 14:00:00', 'Knee cartilage arthroscopy follow-up', 'SCHEDULED');

INSERT INTO medical_records (appointment_id, diagnosis_code, clinical_notes, prescribed_medications, follow_up_recommended) VALUES
  (1, 'I10.9', 'Patient shows mild resting hypertension. Regular aerobic exercise advised.', 'Amlodipine 5mg, Atorvastatin 10mg, Aspirin 75mg', 1);

INSERT INTO patient_bills (patient_id, appointment_id, insurance_policy_number, total_amount, insurance_coverage, patient_copay, payment_status) VALUES
  (1, 1, 'BCBS-POLICY-982103', 450.00, 380.00, 70.00, 'PAID'),
  (2, 2, 'AETNA-HLTH-119283', 250.00, 200.00, 50.00, 'UNPAID');
`
  },
  {
    id: 'sample-university',
    name: 'University Academic & Course Administration',
    category: 'Education / College',
    description: 'College database tracking departments, professors, course curriculums, student enrollments, and academic GPAs. Contains transitive functional dependencies, missing cascade constraints, and grade profiling opportunities.',
    databaseType: 'sqlite',
    schemaSql: `
CREATE TABLE departments (
  department_id INTEGER PRIMARY KEY AUTOINCREMENT,
  dept_code VARCHAR(10) UNIQUE NOT NULL,
  dept_name VARCHAR(100) NOT NULL,
  building_location VARCHAR(100)
);

CREATE TABLE professors (
  professor_id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  salary DECIMAL(10,2) NOT NULL, -- Financial sensitive data
  department_id INTEGER NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_number VARCHAR(30) UNIQUE NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  department_id INTEGER NOT NULL,
  admission_year INTEGER NOT NULL,
  cumulative_gpa DECIMAL(3,2) DEFAULT 0.00,
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

CREATE TABLE courses (
  course_id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code VARCHAR(20) UNIQUE NOT NULL,
  course_title VARCHAR(150) NOT NULL,
  credits INTEGER NOT NULL,
  department_id INTEGER NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(department_id)
);

CREATE TABLE enrollments (
  enrollment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  semester VARCHAR(20) NOT NULL,
  grade_letter VARCHAR(5),
  grade_points DECIMAL(3,2),
  FOREIGN KEY (student_id) REFERENCES students(student_id),
  FOREIGN KEY (course_id) REFERENCES courses(course_id)
);

-- Seed Data
INSERT INTO departments (dept_code, dept_name, building_location) VALUES
  ('CS', 'Computer Science & Engineering', 'Alan Turing Hall'),
  ('EE', 'Electrical & Electronics Engineering', 'Tesla Complex'),
  ('ME', 'Mechanical Engineering', 'Newton Labs');

INSERT INTO professors (full_name, email, salary, department_id) VALUES
  ('Prof. Donald Knuth', 'dknuth@university.edu', 115000.00, 1),
  ('Prof. Grace Hopper', 'ghopper@university.edu', 120000.00, 1),
  ('Prof. Nikola Tesla', 'ntesla@university.edu', 105000.00, 2);

INSERT INTO students (registration_number, first_name, last_name, email, phone, department_id, admission_year, cumulative_gpa) VALUES
  ('MCA-2024-001', 'Aditya', 'Verma', 'aditya.verma@student.edu', '9811223344', 1, 2024, 3.85),
  ('MCA-2024-002', 'Sneha', 'Rao', 'sneha.rao@student.edu', '9822334455', 1, 2024, 3.92),
  ('MCA-2024-003', 'Rohan', 'Kulkarni', 'rohan.k@student.edu', '9833445566', 1, 2024, 3.40);

INSERT INTO courses (course_code, course_title, credits, department_id) VALUES
  ('CS301', 'Database Management Systems & Optimization', 4, 1),
  ('CS302', 'Data Structures & Algorithms', 4, 1),
  ('CS303', 'Distributed Systems & Cloud Computing', 3, 1),
  ('EE201', 'Signals and Linear Systems', 4, 2);

INSERT INTO enrollments (student_id, course_id, semester, grade_letter, grade_points) VALUES
  (1, 1, 'Fall 2025', 'A', 4.0),
  (1, 2, 'Fall 2025', 'A-', 3.7),
  (2, 1, 'Fall 2025', 'A+', 4.0),
  (3, 1, 'Fall 2025', 'B+', 3.3);
`
  }
];
