"""
Curriculum Compiler — AI Lesson Player

Deterministic Python logic. No LLM calls.

Takes an unordered concept list and produces a teaching order using
topological sort based on prerequisite relationships.
Concepts with no prerequisites come first.
Cycles are broken by placing the involved concepts at the end.
"""

import logging
from collections import defaultdict, deque

from models.schemas import ConceptSchema

logger = logging.getLogger(__name__)


def compile(concepts: list[ConceptSchema]) -> list[ConceptSchema]:
    """
    Order concepts for teaching using topological sort.

    Concepts with no prerequisites come first.
    Concepts whose prerequisites have been taught come next.
    Cycles are resolved by treating cyclic concepts as having no prerequisites.

    Returns: ordered list of ConceptSchema
    """
    if not concepts:
        return []

    if len(concepts) == 1:
        return concepts

    # Build lookup: title (lowercase) → concept
    title_map = {c.title.lower().strip(): c for c in concepts}

    # Build adjacency: concept title → set of prerequisite titles that exist in this chapter
    prereqs: dict[str, set[str]] = {}
    dependents: dict[str, set[str]] = defaultdict(set)  # prereq → concepts that need it

    for concept in concepts:
        key = concept.title.lower().strip()
        resolved_prereqs = set()
        for prereq_title in concept.prerequisites:
            prereq_key = prereq_title.lower().strip()
            if prereq_key in title_map and prereq_key != key:
                resolved_prereqs.add(prereq_key)
                dependents[prereq_key].add(key)
        prereqs[key] = resolved_prereqs

    # Count in-degrees (number of unmet prerequisites)
    in_degree = {c.title.lower().strip(): len(prereqs[c.title.lower().strip()]) for c in concepts}

    # Kahn's algorithm for topological sort
    queue = deque()
    for concept in concepts:
        key = concept.title.lower().strip()
        if in_degree[key] == 0:
            queue.append(key)

    ordered_keys: list[str] = []
    while queue:
        key = queue.popleft()
        ordered_keys.append(key)
        for dependent_key in dependents.get(key, set()):
            in_degree[dependent_key] -= 1
            if in_degree[dependent_key] == 0:
                queue.append(dependent_key)

    # Handle any remaining (cyclic) concepts — append at the end in original order
    remaining_keys = [
        c.title.lower().strip() for c in concepts
        if c.title.lower().strip() not in ordered_keys
    ]
    if remaining_keys:
        logger.warning(
            "[CurriculumCompiler] %d cyclic or unresolved concepts, appending at end: %s",
            len(remaining_keys), remaining_keys[:5]
        )
        ordered_keys.extend(remaining_keys)

    # Reconstruct in ordered sequence
    result = [title_map[key] for key in ordered_keys if key in title_map]

    logger.info(
        "[CurriculumCompiler] Ordered %d concepts (original order preserved for non-dependent)",
        len(result)
    )
    return result
