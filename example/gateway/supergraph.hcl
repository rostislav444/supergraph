version = 1

services {
  person    = "http://person:8002"
  property  = "http://property:8001"
  relations = "http://relations:8003"
}

defaults {
  filters {
    int      = ["eq", "in", "gte", "lte", "isnull"]
    string   = ["eq", "in", "icontains", "isnull"]
    bool     = ["eq", "isnull"]
    datetime = ["eq", "gte", "lte", "isnull"]
  }
}

entity "Person" {
  service  = "person"
  resource = "/person"
  keys     = ["id"]

  rel "owned_properties" {
    via  = "relations"
    type = "property_owner"
    out  = "Relationship"
  }
}

entity "Property" {
  service  = "property"
  resource = "/property"
  keys     = ["id"]

  access.direct "rc_id"

  rel "owners" {
    via  = "relations"
    type = "property_owner"
    out  = "Relationship"
  }
}

entity "Relationship" {
  service  = "relations"
  resource = "/relationship"
  keys     = ["id"]

  rel "property" {
    ref = { from = "subject_id", to = "Property.id" }
    as  = "one"
  }
  rel "person" {
    ref = { from = "object_id", to = "Person.id" }
    as  = "one"
  }
}
