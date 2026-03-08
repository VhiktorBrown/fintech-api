/*
  Warnings:

  - You are about to alter the column `balance` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `dailyTransactionLimit` on the `accounts` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `amount` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `balanceAfter` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.
  - You are about to alter the column `balancebefore` on the `transactions` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(18,2)`.

*/
-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "dailyTransactionLimit" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "balancebefore" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "refreshToken" TEXT;
