-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('awaiting_driver', 'offered', 'assigned', 'completed', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "OfferOutcome" AS ENUM ('offered', 'accepted', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "assignments" (
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL,
    "pickup" JSONB NOT NULL,
    "dropoff" JSONB NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6),
    "assigned_driver_id" UUID,
    "offer_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "assignment_attempts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "outcome" "OfferOutcome" NOT NULL,
    "offered_at" TIMESTAMPTZ(6) NOT NULL,
    "responded_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "assignments_status_idx" ON "assignments"("status");

-- CreateIndex
CREATE INDEX "assignment_attempts_order_id_idx" ON "assignment_attempts"("order_id");

-- AddForeignKey
ALTER TABLE "assignment_attempts" ADD CONSTRAINT "assignment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "assignments"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
