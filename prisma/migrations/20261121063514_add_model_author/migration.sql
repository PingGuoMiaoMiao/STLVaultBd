-- AlterTable
ALTER TABLE "models" ADD COLUMN     "user_id" INTEGER;

-- CreateIndex
CREATE INDEX "models_user_id_idx" ON "models"("user_id");

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
