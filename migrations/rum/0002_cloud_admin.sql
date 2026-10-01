-- Additive administration only. Application rollback must retain these tables.
CREATE TABLE IF NOT EXISTS rum_admin_identity (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  account_id TEXT NOT NULL,
  database_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK(environment IN ('production','preview'))
);
CREATE TABLE IF NOT EXISTS rum_export_epoch (
  environment TEXT PRIMARY KEY CHECK(environment IN ('local','production','preview')),
  generation INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO rum_export_epoch(environment) VALUES('local'),('production'),('preview');
-- Operator-only classification, registered BEFORE synthetic ingestion; never a public field.
CREATE TABLE IF NOT EXISTS rum_synthetic_navigations (
  environment TEXT NOT NULL CHECK(environment='preview'),
  navigation_id TEXT NOT NULL,
  registered_at INTEGER NOT NULL,
  PRIMARY KEY(environment,navigation_id)
);
CREATE TRIGGER IF NOT EXISTS rum_guard_environment_insert BEFORE INSERT ON rum_navigations
WHEN EXISTS(SELECT 1 FROM rum_admin_identity WHERE environment<>NEW.environment)
BEGIN SELECT RAISE(ABORT,'RUM environment mismatch'); END;
CREATE TRIGGER IF NOT EXISTS rum_guard_environment_update BEFORE UPDATE ON rum_navigations
WHEN EXISTS(SELECT 1 FROM rum_admin_identity WHERE environment<>NEW.environment)
BEGIN SELECT RAISE(ABORT,'RUM environment mismatch'); END;
CREATE TRIGGER IF NOT EXISTS rum_navigations_epoch_insert AFTER INSERT ON rum_navigations
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_navigations_epoch_update AFTER UPDATE ON rum_navigations
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_navigations_epoch_delete AFTER DELETE ON rum_navigations
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=OLD.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_revisions_epoch_insert AFTER INSERT ON rum_revisions
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_revisions_epoch_update AFTER UPDATE ON rum_revisions
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_revisions_epoch_delete AFTER DELETE ON rum_revisions
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=OLD.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_conflicts_epoch_insert AFTER INSERT ON rum_conflicts
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_conflicts_epoch_update AFTER UPDATE ON rum_conflicts
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_conflicts_epoch_delete AFTER DELETE ON rum_conflicts
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=OLD.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_synthetic_navigations_epoch_insert AFTER INSERT ON rum_synthetic_navigations
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_synthetic_navigations_epoch_update AFTER UPDATE ON rum_synthetic_navigations
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=NEW.environment; END;
CREATE TRIGGER IF NOT EXISTS rum_synthetic_navigations_epoch_delete AFTER DELETE ON rum_synthetic_navigations
BEGIN UPDATE rum_export_epoch SET generation=generation+1 WHERE environment=OLD.environment; END;
