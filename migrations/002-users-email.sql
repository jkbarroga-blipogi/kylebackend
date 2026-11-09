ALTER TABLE `users`
  ADD COLUMN `email` VARCHAR(255) NULL,
  ADD UNIQUE KEY `uq_users_email` (`email`);
