import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(process.cwd(), 'mtm.db');

const db = new Database(dbPath);

console.log('Initializing MTM Database schema...');

// Due to file locking on Windows, drop tables instead of unlinking file
db.exec(`
  DROP TABLE IF EXISTS recommendations;
  DROP TABLE IF EXISTS family_history;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS medications;
  DROP TABLE IF EXISTS conditions;
  DROP TABLE IF EXISTS patients;
  DROP TABLE IF EXISTS contracts;
  DROP TABLE IF EXISTS payers;
  DROP TABLE IF EXISTS insurance_services;
  DROP TABLE IF EXISTS sites;
`);

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    location TEXT
  );

  CREATE TABLE IF NOT EXISTS insurance_services (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    category TEXT
  );

  CREATE TABLE IF NOT EXISTS payers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    payer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    coverages TEXT, -- JSON Object {"Medications": 80, "Surgeries": 100}
    FOREIGN KEY(payer_id) REFERENCES payers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    mrn TEXT UNIQUE NOT NULL,
    primary_site_id TEXT,
    name TEXT NOT NULL,
    dob TEXT,
    age INTEGER,
    sex TEXT,
    phone TEXT,
    address TEXT,
    location TEXT,
    height REAL,
    weight REAL,
    social_status TEXT,
    nationality TEXT,
    national_id TEXT,
    facility TEXT,
    payer_id TEXT,
    contract_id TEXT,
    insurance_id_number TEXT,
    emergency_contact TEXT,
    linked_mrns TEXT, -- JSON array
    risk TEXT,
    alerts TEXT, -- JSON array
    last_mtm TEXT,
    FOREIGN KEY(primary_site_id) REFERENCES sites(id),
    FOREIGN KEY(payer_id) REFERENCES payers(id),
    FOREIGN KEY(contract_id) REFERENCES contracts(id)
  );

  CREATE TABLE IF NOT EXISTS conditions (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    term TEXT NOT NULL,
    status TEXT,
    onset TEXT,
    severity TEXT,
    source TEXT,
    snomed_code TEXT,
    FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    date TEXT NOT NULL,
    pharmacist TEXT,
    type TEXT,
    status TEXT,
    FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    brand TEXT,
    clinical_drug TEXT,
    rxnorm TEXT,
    dosing TEXT,
    indications TEXT, -- JSON array
    instructions TEXT,
    recommendations TEXT,
    tag TEXT,
    status TEXT,
    cdss TEXT, -- JSON array
    FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS family_history (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    relative TEXT,
    condition TEXT NOT NULL,
    onset_age TEXT,
    severity TEXT,
    status TEXT,
    source TEXT,
    snomed_code TEXT,
    timestamp TEXT,
    FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    action TEXT,
    detail TEXT,
    target TEXT,
    priority TEXT,
    due_date TEXT,
    status TEXT,
    evidence TEXT, -- JSON array
    thread INTEGER,
    FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

console.log('Seeding Mock Data...');

// Seed Sites
const insertSite = db.prepare('INSERT INTO sites (id, name, type, location) VALUES (?, ?, ?, ?)');
insertSite.run('SITE-001', 'Main General Hospital', 'Hospital', 'Downtown');
insertSite.run('SITE-002', 'Community Clinic North', 'Clinic', 'Northside');

// Seed Insurance Services
const insertService = db.prepare('INSERT INTO insurance_services (id, name, category) VALUES (?, ?, ?)');
insertService.run('SRV-001', 'Optical', 'Specialty');
insertService.run('SRV-002', 'Mental Health', 'Behavioral');
insertService.run('SRV-003', 'Physical Therapy', 'Rehabilitation');
insertService.run('SRV-004', 'Dermatology', 'Specialty');
insertService.run('SRV-005', 'Cardiology', 'Specialty');
insertService.run('SRV-006', 'Inpatient', 'General');
insertService.run('SRV-007', 'Outpatient', 'General');
insertService.run('SRV-008', 'Emergency', 'General');
insertService.run('SRV-009', 'Laboratory', 'Diagnostics');
insertService.run('SRV-010', 'Radiology', 'Diagnostics');
insertService.run('SRV-011', 'Preventive Care', 'General');
insertService.run('SRV-012', 'Orthopedics', 'Specialty');
insertService.run('SRV-013', 'Medications', 'Pharmacy');
insertService.run('SRV-014', 'Consumables', 'Pharmacy');
insertService.run('SRV-015', 'Surgeries', 'General');
insertService.run('SRV-016', 'Pregnancy', 'Maternity');
insertService.run('SRV-017', 'Delivery', 'Maternity');
insertService.run('SRV-018', 'Dental', 'Specialty');

// Seed Payers
const insertPayer = db.prepare('INSERT INTO payers (id, name, type) VALUES (?, ?, ?)');
insertPayer.run('PAY-001', 'Bupa Health', 'Private');
insertPayer.run('PAY-002', 'Allianz Care', 'Private');
insertPayer.run('PAY-003', 'National Health Service', 'Public');
insertPayer.run('OOP', 'Out of pocket (Self-Pay)', 'Private');

// Seed Contracts
const insertContract = db.prepare('INSERT INTO contracts (id, payer_id, name, coverages) VALUES (?, ?, ?, ?)');
insertContract.run('CON-BUPA-GOLD', 'PAY-001', 'Gold Corporate', JSON.stringify({
  "Medications": 80,
  "Consumables": 100,
  "Surgeries": 100,
  "Pregnancy": 50,
  "Delivery": 50,
  "Dental": 20
}));
insertContract.run('CON-ALLIANZ-STD', 'PAY-002', 'Standard Care', JSON.stringify({
  "Medications": 50,
  "Consumables": 70,
  "Surgeries": 80,
  "Pregnancy": 0,
  "Delivery": 0,
  "Dental": 0
}));

// Seed Patients (from Patients.tsx)
const insertPatient = db.prepare(`
  INSERT INTO patients (id, mrn, primary_site_id, name, dob, age, sex, phone, address, location, height, weight, social_status, nationality, national_id, facility, payer_id, contract_id, insurance_id_number, emergency_contact, linked_mrns, risk, alerts, last_mtm) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertPatient.run('P1001', 'MRN-847291', 'SITE-001', 'Eleanor Rigby', '1951-08-14', 72, 'F', '+44 20 7123 4567', '45 Baker Street, London, UK', '', 162, 65, 'Single', 'United Kingdom', 'UK-12345', 'Main Hospital', 'PAY-001', 'CON-BUPA-GOLD', 'BUP-99887766', 'Paul McCartney (Son) - (555) 987-6543', JSON.stringify([]), 'High', JSON.stringify(['Renal', 'High-Alert Meds']), '2023-10-12');
insertPatient.run('P1002', 'MRN-192834', 'SITE-002', 'John Doe', '1968-03-22', 55, 'M', '+1 234-5678', '456 Abbey Road', 'https://www.google.com/maps?q=37.3875,122.0575', 180, 85, 'Married', 'United States', 'US-54321', 'Network Clinic', 'PAY-002', 'CON-ALLIANZ-STD', 'ALL-55443322', 'Jane Doe (Wife)', JSON.stringify([]), 'Medium', JSON.stringify(['Allergy']), '2024-01-05');
insertPatient.run('P1003', 'MRN-564738', 'SITE-001', 'Jane Smith', '1955-11-05', 68, 'F', '+44 345-6789', '789 Strawberry Field', '', 165, 70, 'Widowed', 'United Kingdom', 'UK-98765', 'Main Hospital', 'PAY-003', null, 'NHS-11223344', '-', JSON.stringify([]), 'Low', JSON.stringify([]), '2023-11-20');
insertPatient.run('P1004', 'MRN-938475', 'SITE-001', 'Robert Johnson', '1942-01-30', 81, 'M', '+20 1234567890', '321 Crossroads Blvd', '', 170, 75, 'Married', 'Egypt', 'EG-2980101', 'Main Hospital', 'OOP', null, null, 'Willie Brown (Friend)', JSON.stringify([]), 'High', JSON.stringify(['Hepatic', 'Fall Risk']), '2023-09-15');

// Seed Family History for P1001
const insertFamilyHistory = db.prepare(`
  INSERT INTO family_history (id, patient_id, relative, condition, onset_age, severity, status, source, snomed_code, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertFamilyHistory.run('FH1', 'P1001', 'Father', 'Type 2 Diabetes Mellitus', '60', 'Severe', 'Confirmed', 'HIS', '44054006', '2023-01-15T10:00:00Z');
insertFamilyHistory.run('FH2', 'P1001', 'Mother', 'Hypertension', '65', 'Moderate', 'Confirmed', 'HIS', '38341003', '2023-01-15T10:00:00Z');

// Seed Conditions for P1001 (from SectionAConditions.tsx)
const insertCondition = db.prepare(`
  INSERT INTO conditions (id, patient_id, term, status, onset, severity, source, snomed_code) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
insertCondition.run('C1', 'P1001', 'Type 2 Diabetes Mellitus', 'Active', '2018-05-12', 'Moderate', 'HIS', '44054006');
insertCondition.run('C2', 'P1001', 'Essential Hypertension', 'Active', '2015-11-03', 'Mild', 'HIS', '38341003');
insertCondition.run('C3', 'P1001', 'Chronic Kidney Disease Stage 3a', 'Active', '2021-02-20', 'Moderate', 'SNOMED CT Browser', '433144002');
insertCondition.run('C4', 'P1001', 'Acute Bronchitis', 'Inactive', '2023-01-10', 'Mild', 'HIS', '10509002');

// Seed Sessions for P1001
const insertSession = db.prepare(`
  INSERT INTO sessions (id, patient_id, date, pharmacist, type, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);
insertSession.run('S101', 'P1001', '2023-10-12T09:00:00Z', 'Dr. Sarah Wilson', 'Comprehensive Medication Review', 'Completed');
insertSession.run('S102', 'P1001', new Date().toISOString(), 'Dr. Sarah Wilson', 'Targeted Follow-up', 'Open');

// Seed Medications for P1001 (from SectionBMedications.tsx)
const insertMed = db.prepare(`
  INSERT INTO medications (id, patient_id, brand, clinical_drug, rxnorm, dosing, indications, instructions, recommendations, tag, status, cdss)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertMed.run('M1', 'P1001', 'Lisinopril', 'Lisinopril 10mg Oral Tablet', '314076', '1 tablet PO daily', JSON.stringify(['Essential Hypertension']), 'Take one tablet by mouth daily in the morning.', 'Monitor BP and renal function. Patient reports occasional dry cough.', 'Chronic', 'Active', JSON.stringify([{ type: "warn", label: "Monitoring Required", detail: "Check SCr/K+ within 1-2 weeks of initiation/dose change." }]));
insertMed.run('M2', 'P1001', 'Metformin ER', 'Metformin hydrochloride 500mg Extended Release Tablet', '860975', '2 tablets PO daily with evening meal', JSON.stringify(['Type 2 Diabetes Mellitus']), 'Take two tablets by mouth daily with your evening meal. Do not crush or chew.', 'Titrated to 1000mg daily. GI tolerance is good.', 'Chronic', 'Active', JSON.stringify([{ type: "danger", label: "Dose Adjustment", detail: "eGFR is 45. Max dose 1000mg/day." }]));
insertMed.run('M3', 'P1001', 'Ibuprofen', 'Ibuprofen 400mg Oral Tablet', '316049', '1 tablet PO Q6H PRN pain', JSON.stringify(['Osteoarthritis of knee']), 'Take one tablet every 6 hours as needed for pain. Take with food.', 'Advised to limit use due to CKD risk.', 'Acute', 'Active', JSON.stringify([{ type: "warn", label: "DDI", detail: "Potential interaction with Lisinopril (decreased antihypertensive effect, increased renal risk)." }]));

// Seed Recommendations for P1001 (from SectionFRecommendations.tsx)
const insertRec = db.prepare(`
  INSERT INTO recommendations (id, patient_id, session_id, action, detail, target, priority, due_date, status, evidence, thread)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
insertRec.run('REC-001', 'P1001', 'S101', 'Dose Change', 'Decrease Metformin to 1000mg/day due to declining eGFR (45 mL/min).', 'Physician', 'Urgent', '2023-10-15', 'Completed', JSON.stringify(['M2', 'Lab: Renal Panel']), 1);
insertRec.run('REC-003', 'P1001', 'S101', 'Patient Education', 'Counsel patient on NSAID avoidance (Ibuprofen) to protect renal function.', 'Patient', 'Routine', '2023-10-12', 'Completed', JSON.stringify(['M3', 'C3']), 2);
insertRec.run('REC-002', 'P1001', 'S102', 'Monitoring Order', 'Order Basic Metabolic Panel (BMP) to check Potassium levels (last checked 3 months ago).', 'Nurse', 'Routine', '2023-10-20', 'Draft', JSON.stringify(['M1']), 0);

console.log('Database initialized successfully at mtm.db');
