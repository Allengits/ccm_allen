-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'REGISTRAR', 'JUDGE', 'ADVOCATE') NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `advocates` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `bar_number` VARCHAR(191) NOT NULL,
    `specialization` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `advocates_user_id_key`(`user_id`),
    UNIQUE INDEX `advocates_bar_number_key`(`bar_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `courtrooms` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `courtrooms_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cases` (
    `id` VARCHAR(191) NOT NULL,
    `case_number` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `case_type` ENUM('CRIMINAL', 'CIVIL', 'FAMILY', 'PROPERTY', 'COMMERCIAL', 'CONSTITUTIONAL', 'OTHER') NOT NULL,
    `status` ENUM('REGISTERED', 'ADVOCATE_ASSIGNED', 'HEARING_SCHEDULED', 'UNDER_TRIAL', 'JUDGMENT_RESERVED', 'CLOSED') NOT NULL DEFAULT 'REGISTERED',
    `priority` ENUM('NORMAL', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `petitioner` VARCHAR(191) NOT NULL,
    `respondent` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `filing_date` DATETIME(3) NOT NULL,
    `judge_id` VARCHAR(191) NULL,
    `registered_by_id` VARCHAR(191) NOT NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cases_case_number_key`(`case_number`),
    INDEX `cases_status_idx`(`status`),
    INDEX `cases_filing_date_idx`(`filing_date`),
    INDEX `cases_case_type_idx`(`case_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_advocates` (
    `id` VARCHAR(191) NOT NULL,
    `case_id` VARCHAR(191) NOT NULL,
    `advocate_id` VARCHAR(191) NOT NULL,
    `side` ENUM('PETITIONER', 'RESPONDENT') NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `case_advocates_case_id_advocate_id_key`(`case_id`, `advocate_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hearings` (
    `id` VARCHAR(191) NOT NULL,
    `case_id` VARCHAR(191) NOT NULL,
    `courtroom_id` VARCHAR(191) NOT NULL,
    `judge_id` VARCHAR(191) NOT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `duration_mins` INTEGER NOT NULL DEFAULT 30,
    `purpose` VARCHAR(191) NOT NULL,
    `status` ENUM('SCHEDULED', 'COMPLETED', 'ADJOURNED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `outcome_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `hearings_scheduled_at_idx`(`scheduled_at`),
    INDEX `hearings_courtroom_id_scheduled_at_idx`(`courtroom_id`, `scheduled_at`),
    INDEX `hearings_judge_id_scheduled_at_idx`(`judge_id`, `scheduled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evidence` (
    `id` VARCHAR(191) NOT NULL,
    `case_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `evidence_type` ENUM('DOCUMENT', 'PHOTOGRAPH', 'VIDEO', 'AUDIO', 'PHYSICAL', 'DIGITAL_RECORD', 'TESTIMONY') NOT NULL,
    `description` TEXT NULL,
    `submitted_by` VARCHAR(191) NOT NULL,
    `submitted_by_id` VARCHAR(191) NULL,
    `status` ENUM('SUBMITTED', 'ADMITTED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `file_name` VARCHAR(191) NULL,
    `file_path` VARCHAR(191) NULL,
    `mime_type` VARCHAR(191) NULL,
    `file_size` INTEGER NULL,
    `file_hash` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `evidence_case_id_idx`(`case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evidence_custody_logs` (
    `id` VARCHAR(191) NOT NULL,
    `evidence_id` VARCHAR(191) NOT NULL,
    `action` ENUM('SUBMITTED', 'VIEWED', 'TRANSFERRED', 'ADMITTED', 'REJECTED', 'RETURNED') NOT NULL,
    `performed_by_id` VARCHAR(191) NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `judgments` (
    `id` VARCHAR(191) NOT NULL,
    `case_id` VARCHAR(191) NOT NULL,
    `judge_id` VARCHAR(191) NOT NULL,
    `status` ENUM('RESERVED', 'DELIVERED') NOT NULL,
    `outcome` ENUM('ALLOWED', 'DISMISSED', 'CONVICTED', 'ACQUITTED', 'SETTLED', 'DISPOSED') NULL,
    `summary` TEXT NOT NULL,
    `reserved_on` DATETIME(3) NULL,
    `delivered_on` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `judgments_case_id_key`(`case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_status_history` (
    `id` VARCHAR(191) NOT NULL,
    `case_id` VARCHAR(191) NOT NULL,
    `from_status` ENUM('REGISTERED', 'ADVOCATE_ASSIGNED', 'HEARING_SCHEDULED', 'UNDER_TRIAL', 'JUDGMENT_RESERVED', 'CLOSED') NULL,
    `to_status` ENUM('REGISTERED', 'ADVOCATE_ASSIGNED', 'HEARING_SCHEDULED', 'UNDER_TRIAL', 'JUDGMENT_RESERVED', 'CLOSED') NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `changed_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `case_status_history_case_id_idx`(`case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_sequences` (
    `id` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `last_number` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `case_sequences_prefix_year_key`(`prefix`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `advocates` ADD CONSTRAINT `advocates_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cases` ADD CONSTRAINT `cases_judge_id_fkey` FOREIGN KEY (`judge_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cases` ADD CONSTRAINT `cases_registered_by_id_fkey` FOREIGN KEY (`registered_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_advocates` ADD CONSTRAINT `case_advocates_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_advocates` ADD CONSTRAINT `case_advocates_advocate_id_fkey` FOREIGN KEY (`advocate_id`) REFERENCES `advocates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hearings` ADD CONSTRAINT `hearings_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hearings` ADD CONSTRAINT `hearings_courtroom_id_fkey` FOREIGN KEY (`courtroom_id`) REFERENCES `courtrooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hearings` ADD CONSTRAINT `hearings_judge_id_fkey` FOREIGN KEY (`judge_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence` ADD CONSTRAINT `evidence_submitted_by_id_fkey` FOREIGN KEY (`submitted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_custody_logs` ADD CONSTRAINT `evidence_custody_logs_evidence_id_fkey` FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evidence_custody_logs` ADD CONSTRAINT `evidence_custody_logs_performed_by_id_fkey` FOREIGN KEY (`performed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judgments` ADD CONSTRAINT `judgments_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judgments` ADD CONSTRAINT `judgments_judge_id_fkey` FOREIGN KEY (`judge_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_status_history` ADD CONSTRAINT `case_status_history_case_id_fkey` FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_status_history` ADD CONSTRAINT `case_status_history_changed_by_id_fkey` FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
