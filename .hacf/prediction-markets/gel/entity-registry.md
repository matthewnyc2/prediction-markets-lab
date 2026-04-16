# Entity Registry (GEL-1)

Append-only canonical declaration of every entity in the project.
Each field includes a source_trace reference to the originating artifact.
Reads always at current HEAD; writes are atomic merges that append to the end, never overwrite.

## Entries

<!-- gel-entity-merger appends records here. Do not edit existing records. -->
