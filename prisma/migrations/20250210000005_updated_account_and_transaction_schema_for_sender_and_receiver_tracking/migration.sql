/*
  Warnings:

  - You are about to drop the column `accountId` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `recipientAccountNumber` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `senderAccountNumber` on the `transactions` table. All the data in the column will be lost.
  - Changed the type of `type` on the `transactions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_accountId_fkey";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "accountId",
DROP COLUMN "recipientAccountNumber",
DROP COLUMN "senderAccountNumber",
ADD COLUMN     "recipientAccountId" INTEGER,
ADD COLUMN     "senderAccountId" INTEGER,
DROP COLUMN "type",
ADD COLUMN     "type" "TransactionType" NOT NULL;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_senderAccountId_fkey" FOREIGN KEY ("senderAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recipientAccountId_fkey" FOREIGN KEY ("recipientAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
