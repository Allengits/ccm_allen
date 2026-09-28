-- AlterTable
ALTER TABLE `case_advocates` ADD COLUMN `assigned_by_id` VARCHAR(191) NULL,
    ADD COLUMN `unassign_reason` VARCHAR(500) NULL,
    ADD COLUMN `unassigned_at` DATETIME(3) NULL,
    ADD COLUMN `unassigned_by_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `case_advocates` ADD CONSTRAINT `case_advocates_assigned_by_id_fkey` FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_advocates` ADD CONSTRAINT `case_advocates_unassigned_by_id_fkey` FOREIGN KEY (`unassigned_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
