-- RoktoNet Database Schema
-- Matches the Phase 2 ER diagram (project_memory.md Section 6)
-- Run this in pgAdmin's Query Tool against the 'roktonet' database.

CREATE TABLE organizations (
    org_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    org_type    VARCHAR(20) NOT NULL CHECK (org_type IN ('blood_bank', 'ngo', 'hospital')),
    district    VARCHAR(100) NOT NULL
);

CREATE TABLE users (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(org_id),
    role            VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'hospital', 'bank', 'ngo', 'donor')),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL
);

CREATE TABLE donors (
    donor_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID REFERENCES organizations(org_id),
    blood_type          VARCHAR(5) NOT NULL CHECK (blood_type IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')),
    last_donation_date  DATE,
    eligibility_status  VARCHAR(20) NOT NULL DEFAULT 'eligible' CHECK (eligibility_status IN ('eligible', 'ineligible', 'pending'))
);

CREATE TABLE inventory_units (
    unit_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(org_id),
    donor_id            UUID REFERENCES donors(donor_id),
    blood_type          VARCHAR(5) NOT NULL CHECK (blood_type IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')),
    component           VARCHAR(20) NOT NULL CHECK (component IN ('whole_blood', 'platelets', 'plasma')),
    collection_date     DATE NOT NULL,
    expiry_date         DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'dispatched', 'expired'))
);

CREATE TABLE requests (
    request_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(org_id),
    blood_type          VARCHAR(5) NOT NULL CHECK (blood_type IN ('O-','O+','A-','A+','B-','B+','AB-','AB+')),
    component           VARCHAR(20) NOT NULL CHECK (component IN ('whole_blood', 'platelets', 'plasma')),
    quantity            INT NOT NULL CHECK (quantity > 0),
    urgency_tier        VARCHAR(20) NOT NULL CHECK (urgency_tier IN ('elective', 'routine', 'urgent', 'critical')),
    needed_by_date       DATE,
    fulfillment_path    VARCHAR(30) CHECK (fulfillment_path IN ('inventory', 'donor_fallback', 'parallel_critical', 'scheduled_reservation', 'scheduled_donor_mobilization')),
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE allocation_records (
    allocation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES requests(request_id),
    unit_id         UUID NOT NULL REFERENCES inventory_units(unit_id),
    allocated_at    TIMESTAMP NOT NULL DEFAULT now(),
    distance_km     FLOAT
);

CREATE TABLE donor_mobilizations (
    mobilization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES requests(request_id),
    donor_id        UUID NOT NULL REFERENCES donors(donor_id),
    invite_status   VARCHAR(20) NOT NULL DEFAULT 'invited' CHECK (invite_status IN ('invited', 'confirmed', 'declined')),
    slot_date       DATE
);