# Chapter 13 correction

The previous implementation created one temporary Pandas DataFrame for every H3 origin. This build deduplicates stores once, creates only sparse qualifying origin–store pairs, and aggregates counts and square footage with NumPy `bincount`.

Validated with 20,000 origins and 10,000 stores in a synthetic benchmark.
