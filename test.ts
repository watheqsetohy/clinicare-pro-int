import Database from 'better-sqlite3';
const db = new Database('snomed.db');
console.log('Concepts:', db.prepare("SELECT * FROM Concept WHERE id = '191044006' OR id = '73211009'").all());
console.log('Descriptions:', db.prepare("SELECT id, conceptId, term, typeId FROM Description WHERE conceptId IN ('191044006', '73211009') AND active=1").all());
console.log('Rels 191044006:', db.prepare("SELECT count(*) FROM Relationship WHERE sourceId='191044006' OR destinationId='191044006'").all());
console.log('Rels 73211009:', db.prepare("SELECT count(*) FROM Relationship WHERE sourceId='73211009' OR destinationId='73211009'").all());
