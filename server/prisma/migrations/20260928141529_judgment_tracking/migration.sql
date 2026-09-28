-- AlterTable
ALTER TABLE `judgments` ADD COLUMN `delivered_at` DATETIME(3) NULL,
    ADD COLUMN `delivered_by_id` VARCHAR(191) NULL,
    ADD COLUMN `judgment_date` DATETIME(3) NULL,
    ADD COLUMN `reserve_note` VARCHAR(500) NULL,
    ADD COLUMN `reserved_at` DATETIME(3) NULL,
    ADD COLUMN `reserved_by_id` VARCHAR(191) NULL,
    MODIFY `judge_id` VARCHAR(191) NULL,
    MODIFY `summary` TEXT NULL;

-- CreateIndex
CREATE INDEX `judgments_status_idx` ON `judgments`(`status`);

-- CreateIndex
CREATE INDEX `judgments_reserved_at_idx` ON `judgments`(`reserved_at`);

-- CreateIndex
CREATE INDEX `judgments_judgment_date_idx` ON `judgments`(`judgment_date`);

-- CreateIndex
CREATE INDEX `judgments_outcome_idx` ON `judgments`(`outcome`);

-- AddForeignKey
ALTER TABLE `judgments` ADD CONSTRAINT `judgments_reserved_by_id_fkey` FOREIGN KEY (`reserved_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judgments` ADD CONSTRAINT `judgments_delivered_by_id_fkey` FOREIGN KEY (`delivered_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `judgments` RENAME INDEX `judgments_judge_id_fkey` TO `judgments_judge_id_idx`;
