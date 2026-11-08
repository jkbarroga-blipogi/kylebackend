ALTER TABLE `Adopter`
  ADD COLUMN `user_id` INT NULL,
  ADD UNIQUE KEY `uq_adopter_user` (`user_id`);

ALTER TABLE `Adopter`
  ADD CONSTRAINT `fk_adopter_user` FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `Adoption_Application`
  MODIFY COLUMN `staff_id` INT NULL DEFAULT NULL;
