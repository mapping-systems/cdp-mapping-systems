# Assignment 02 — Dark Kitchen × Rental Geography

## Question
How do the rental geographies of street-facing and delivery-oriented food spaces differ across Beijing?

## Dataset 1
`rent_merged_clean.csv`

Rental listings collected with two different keyword strategies:
- `bright`: street-facing / conventional commercial food spaces
- `dark`: delivery-oriented / stall-like / less visible food-production spaces

These are asking-rent samples, not the actual leases of platform restaurants.

## Dataset 2
Platform restaurant locations from the dark-kitchen project.

Needed fields:
- latitude
- longitude
- visible / potential-dark classification

## Proposed geoprocessing workflow

Rental listings  
→ H3 aggregation  
→ median bright-space rent + median dark-space rent  
→ rent-gap surface

Platform restaurants  
→ same H3 grid  
→ visible / dark store counts

Then compare restaurant distribution with the local rental environment.

## Main outputs
1. Bright-space rent H3
2. Dark-space rent H3
3. Bright − dark rent-gap H3
4. Proposed overlay with platform restaurant locations

## Interpretation
The analysis tests a spatial association, not a causal claim. A rental listing and a restaurant point are not assumed to represent the same property.
