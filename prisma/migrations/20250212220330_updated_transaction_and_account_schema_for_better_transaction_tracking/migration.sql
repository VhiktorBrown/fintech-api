/*
  Warnings:

  - You are about to drop the column `recipientAccountId` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `senderAccountId` on the `transactions` table. All the data in the column will be lost.
  - Added the required column `balanceAfter` to the `transactions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `balancebefore` to the `transactions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_recipientAccountId_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_senderAccountId_fkey";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "recipientAccountId",
DROP COLUMN "senderAccountId",
ADD COLUMN     "accountId" INTEGER,
ADD COLUMN     "balanceAfter" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "balancebefore" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "counterpartyAccountId" INTEGER;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterpartyAccountId_fkey" FOREIGN KEY ("counterpartyAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
