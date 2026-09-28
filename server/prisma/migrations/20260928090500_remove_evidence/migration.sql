-- DropForeignKey
ALTER TABLE `evidence` DROP FOREIGN KEY `evidence_case_id_fkey`;

-- DropForeignKey
ALTER TABLE `evidence` DROP FOREIGN KEY `evidence_submitted_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `evidence_custody_logs` DROP FOREIGN KEY `evidence_custody_logs_evidence_id_fkey`;

-- DropForeignKey
ALTER TABLE `evidence_custody_logs` DROP FOREIGN KEY `evidence_custody_logs_performed_by_id_fkey`;

-- DropTable
DROP TABLE `evidence`;

-- DropTable
DROP TABLE `evidence_custody_logs`;
