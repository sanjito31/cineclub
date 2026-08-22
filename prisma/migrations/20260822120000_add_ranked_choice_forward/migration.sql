-- AlterEnum
ALTER TYPE "cineclub"."finalist_ordering" ADD VALUE 'RANKED_CHOICE_FORWARD';

-- AlterTable
ALTER TABLE "cineclub"."rooms" ALTER COLUMN "finalist_ordering" SET DEFAULT 'RANKED_CHOICE_FORWARD';
