// Test data for generating realistic values

export const TEST_FIRST_NAMES = [
  'John', 'Jane', 'Alex', 'Maria', 'Ivan', 'Anna', 'Peter', 'Olga',
  'Michael', 'Sarah', 'David', 'Emma', 'James', 'Olivia', 'Robert', 'Sophia',
]

export const TEST_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee',
]

export const TEST_CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'London', 'Paris', 'Berlin', 'Tokyo', 'Sydney',
  'Toronto', 'Moscow', 'Barcelona', 'Amsterdam', 'Dubai',
]

export const TEST_COUNTRIES = [
  'USA', 'UK', 'Germany', 'France', 'Canada',
  'Australia', 'Japan', 'Spain', 'Netherlands', 'UAE',
]

export const TEST_STREETS = [
  'Main St', 'Oak Ave', 'Park Blvd', 'Market St', 'Broadway',
  'First Ave', 'Second St', 'Maple Dr', 'Pine Rd', 'Cedar Ln',
]

export const TEST_COMPANY_SUFFIXES = [
  'Inc', 'LLC', 'Corp', 'Ltd', 'Group', 'Solutions', 'Technologies', 'Systems',
]

export const TEST_LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
]

// Special FK field mappings to entity names
export const SPECIAL_FK_MAPPINGS: Record<string, string> = {
  address: 'GeoObject',
  geo_object: 'GeoObject',
  owner: 'Person',
  user: 'User',
  created_by: 'User',
  updated_by: 'User',
  parent: 'self', // Special case - refers to same entity
}

// Field name patterns for test data generation
export const FIELD_PATTERNS = {
  email: ['email', 'mail', 'e_mail'],
  phone: ['phone', 'tel', 'mobile', 'cell'],
  url: ['url', 'link', 'website', 'site', 'href'],
  name: ['name', 'title', 'label'],
  firstName: ['first_name', 'firstname', 'given_name'],
  lastName: ['last_name', 'lastname', 'surname', 'family_name'],
  fullName: ['full_name', 'fullname', 'display_name'],
  address: ['address', 'street', 'addr'],
  city: ['city', 'town'],
  country: ['country', 'nation'],
  description: ['description', 'desc', 'about', 'bio', 'summary', 'content', 'text', 'body', 'notes'],
  company: ['company', 'organization', 'org', 'business'],
  code: ['code', 'sku', 'ref', 'reference'],
}
