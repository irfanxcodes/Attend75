"""Full audit: verify concept-to-slide matching for all chapters."""
import sys
sys.path.insert(0, '.')
from db.session import SessionLocal
from db.models.ai_concept import AIConcept
from db.models.lesson_slide import LessonSlide
from db.models.slide_teaching_script import SlideTeachingScript
from db.models.chapter_upload import ChapterUpload

STOPWORDS = {"a","an","the","of","and","or","by","in","to","is","are","cost","costs"}

def title_sim(a, b):
    aw = set(a.lower().replace(",", " ").replace(".", " ").split()) - STOPWORDS
    bw = set(b.lower().replace(",", " ").replace(".", " ").split()) - STOPWORDS
    if not aw or not bw: return 0.0
    return len(aw & bw) / max(len(aw), len(bw))

def body_sim(concept, text):
    t = text.lower()
    score = 0.0
    c_words = set((concept.title or "").lower().replace(",", " ").split()) - STOPWORDS
    for w in c_words:
        if len(w) > 3 and w in t: score += 1.0
    for kw in (concept.keywords or [])[:5]:
        if kw.lower() in t: score += 0.5
    return score

def match_concept(slide_no, slide_title, slide_body, all_concepts):
    if slide_no == 1:
        return "CHAPTER INTRO", "intro"

    # Step 1: title match
    scored = sorted([(c, title_sim(slide_title, c.title)) for c in all_concepts],
                    key=lambda x: x[1], reverse=True)
    best_c, best_s = scored[0] if scored else (None, 0.0)
    second_s = scored[1][1] if len(scored) > 1 else 0.0
    use_title = best_s >= 0.5 or (best_s > 0 and best_s >= second_s * 2.0 and best_s >= 0.3)

    if use_title and best_c:
        return best_c.title, f"title({best_s:.2f})"

    # Step 2: body match (threshold 2.0, must beat second best)
    text = (slide_body or "") + " " + slide_title
    b_scored = sorted([(c, body_sim(c, text)) for c in all_concepts],
                      key=lambda x: x[1], reverse=True)
    b_best_c, b_best_s = b_scored[0] if b_scored else (None, 0.0)
    b_second_s = b_scored[1][1] if len(b_scored) > 1 else 0.0
    use_body = b_best_s >= 2.0 and b_best_s > b_second_s and b_best_c is not None

    if use_body:
        return b_best_c.title, f"body({b_best_s:.1f})"

    # Step 3: sequence order
    sorted_c = sorted(all_concepts, key=lambda c: (c.source_page or 999))
    idx = slide_no - 1
    if 0 <= idx < len(sorted_c):
        return sorted_c[idx].title, "sequence"
    return sorted_c[-1].title if sorted_c else "???", "seq-overflow"


with SessionLocal() as s:
    uploads = (
        s.query(ChapterUpload)
        .join(LessonSlide, LessonSlide.upload_id == ChapterUpload.id)
        .filter(ChapterUpload.upload_status.in_(["ready", "ready_low_coverage"]))
        .distinct().all()
    )

    total_ok = total_uncertain = total_mismatch = 0

    for upload in uploads:
        uid = upload.id
        slides = s.query(LessonSlide).filter(
            LessonSlide.upload_id == uid
        ).order_by(LessonSlide.slide_number).all()
        all_c = s.query(AIConcept).filter(AIConcept.upload_id == uid).all()
        scripts = {sc.slide_number: sc for sc in
                   s.query(SlideTeachingScript).filter(SlideTeachingScript.upload_id == uid).all()}

        print(f"\n{'='*100}")
        print(f"Chapter: {upload.chapter_key[:50]}  |  {len(slides)} slides / {len(all_c)} concepts")
        print(f"{'='*100}")
        print(f"  {'SL':3} {'SLIDE TITLE':33} {'MATCHED CONCEPT':33} {'METHOD':14} {'STATUS':16} CACHED")
        print(f"  {'-'*95}")

        for sl in slides:
            matched, method = match_concept(
                sl.slide_number, sl.title, sl.body_preview or "", all_c
            )

            if method == "intro":
                status = "INTRO ✓"
            else:
                sw = set(sl.title.lower().split()) - STOPWORDS
                cw = set(matched.lower().split()) - STOPWORDS
                overlap = sw & cw
                if overlap:
                    status = f"OK ✓ ({','.join(list(overlap)[:2])})"
                    total_ok += 1
                elif method.startswith("title"):
                    status = "OK ✓ (title)"
                    total_ok += 1
                elif method in ("sequence", "seq-overflow"):
                    status = "UNCERTAIN"
                    total_uncertain += 1
                else:
                    status = "? MISMATCH"
                    total_mismatch += 1

            cached = "✓ cached" if scripts.get(sl.slide_number) else "-"
            print(f"  {sl.slide_number:3d} {sl.title[:33]:33} {matched[:33]:33} {method:14} {status:16} {cached}")

    print(f"\n{'='*100}")
    print(f"TOTAL: {total_ok} OK  |  {total_uncertain} uncertain (sequence)  |  {total_mismatch} mismatches")
    print(f"{'='*100}")
