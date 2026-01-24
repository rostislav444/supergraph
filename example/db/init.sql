-- MVP Test Data for Supergraph
-- This script runs automatically when postgres container starts

-- Create tables
CREATE TABLE IF NOT EXISTS persons (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    rc_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS relationships (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER NOT NULL,
    object_id INTEGER NOT NULL,
    relationship_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_relationships_object_id ON relationships(object_id);
CREATE INDEX IF NOT EXISTS idx_relationships_subject_id ON relationships(subject_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_properties_rc_id ON properties(rc_id);

-- Insert test data

-- Persons (10 persons)
INSERT INTO persons (id, first_name, last_name) VALUES
    (1, 'Ivan', 'Petrenko'),
    (2, 'Maria', 'Kovalenko'),
    (3, 'Petro', 'Shevchenko'),
    (4, 'Olena', 'Bondarenko'),
    (5, 'Andrii', 'Tkachenko'),
    (6, 'Natalia', 'Melnyk'),
    (7, 'Serhii', 'Kravchenko'),
    (8, 'Yulia', 'Lysenko'),
    (9, 'Dmytro', 'Moroz'),
    (10, 'Oksana', 'Honchar')
ON CONFLICT (id) DO NOTHING;

-- Properties (with rc_id for tenant isolation - 2 residential complexes)
-- RC 1: properties 100-104
-- RC 2: properties 105-109
INSERT INTO properties (id, name, rc_id) VALUES
    (100, 'Квартира 1, ЖК Сонячний', 1),
    (101, 'Квартира 2, ЖК Сонячний', 1),
    (102, 'Квартира 3, ЖК Сонячний', 1),
    (103, 'Квартира 4, ЖК Сонячний', 1),
    (104, 'Квартира 5, ЖК Сонячний', 1),
    (105, 'Квартира 1, ЖК Зелений', 2),
    (106, 'Квартира 2, ЖК Зелений', 2),
    (107, 'Квартира 3, ЖК Зелений', 2),
    (108, 'Квартира 4, ЖК Зелений', 2),
    (109, 'Квартира 5, ЖК Зелений', 2)
ON CONFLICT (id) DO NOTHING;

-- Relationships (Person owns Property)
-- subject_id = property_id, object_id = person_id
INSERT INTO relationships (id, subject_id, object_id, relationship_type, status) VALUES
    -- Ivan Petrenko owns 2 properties in RC1
    (1, 100, 1, 'property_owner', 'active'),
    (2, 101, 1, 'property_owner', 'active'),
    -- Maria Kovalenko owns 1 property in RC1
    (3, 102, 2, 'property_owner', 'active'),
    -- Petro Shevchenko - inactive ownership
    (4, 103, 3, 'property_owner', 'inactive'),
    -- Olena Bondarenko owns in RC2
    (5, 105, 4, 'property_owner', 'active'),
    (6, 106, 4, 'property_owner', 'active'),
    -- Andrii Tkachenko
    (7, 107, 5, 'property_owner', 'active'),
    -- Natalia Melnyk
    (8, 108, 6, 'property_owner', 'active'),
    -- Serhii Kravchenko - multiple properties
    (9, 104, 7, 'property_owner', 'active'),
    (10, 109, 7, 'property_owner', 'active'),
    -- Some tenant relationships
    (11, 100, 8, 'tenant', 'active'),
    (12, 105, 9, 'tenant', 'active'),
    (13, 107, 10, 'tenant', 'inactive')
ON CONFLICT (id) DO NOTHING;

-- Reset sequences to avoid conflicts
SELECT setval('persons_id_seq', 100);
SELECT setval('properties_id_seq', 200);
SELECT setval('relationships_id_seq', 100);

-- Verify data
DO $$
BEGIN
    RAISE NOTICE 'MVP Test Data loaded:';
    RAISE NOTICE '  - Persons: %', (SELECT COUNT(*) FROM persons);
    RAISE NOTICE '  - Properties: %', (SELECT COUNT(*) FROM properties);
    RAISE NOTICE '  - Relationships: %', (SELECT COUNT(*) FROM relationships);
END $$;
