-- AlterTable
ALTER TABLE `hearings` ADD COLUMN `scheduled_by_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `hearing_events` (
    `id` VARCHAR(191) NOT NULL,
    `hearing_id` VARCHAR(191) NOT NULL,
    `action` ENUM('SCHEDULED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'ADJOURNED') NOT NULL,
    `from_scheduled_at` DATETIME(3) NULL,
    `to_scheduled_at` DATETIME(3) NULL,
    `from_courtroom_id` VARCHAR(191) NULL,
    `to_courtroom_id` VARCHAR(191) NULL,
    `note` VARCHAR(500) NULL,
    `performed_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hearing_events_hearing_id_created_at_idx`(`hearing_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hearings` ADD CONSTRAINT `hearings_scheduled_by_id_fkey` FOREIGN KEY (`scheduled_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hearing_events` ADD CONSTRAINT `hearing_events_hearing_id_fkey` FOREIGN KEY (`hearing_id`) REFERENCES `hearings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hearing_events` ADD CONSTRAINT `hearing_events_performed_by_id_fkey` FOREIGN KEY (`performed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
