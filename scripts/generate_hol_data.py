#!/usr/bin/env python3
"""
generate_hol_data.py — Regenerates frontend/public/data/higherOrLower.json
from free public APIs. Run this periodically to keep data fresh.

Usage:
    python scripts/generate_hol_data.py

Requirements:
    pip install requests

Sources used (all free, no paid key required):
    - Countries:  https://restcountries.com/v3.1/all  (no key)
    - Mountains:  hardcoded (no free API with heights + images)
    - Pokémon:    https://pokeapi.co  (no key)
    - Movies:     hardcoded TMDB data (TMDB key optional, images from their CDN)
    - YouTubers:  hardcoded (YouTube API is rate-limited, subs change slowly)

Images are hotlinked — this script stores only the URL, not the file.
Attribution requirements:
    - Wikimedia images: Creative Commons, credit in app footer
    - flagcdn.com: public domain flags
    - PokeAPI sprites: free to use
    - TMDB images: require TMDB logo attribution
"""

import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

OUTPUT_PATH = Path(__file__).parent.parent / "frontend" / "public" / "data" / "higherOrLower.json"

# ── Helpers ──────────────────────────────────────────────────────────────────

def fetch_json(url: str, retries: int = 3) -> dict | list:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "attend75-hol-generator/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt < retries - 1:
                print(f"  Retry {attempt + 1}/{retries} for {url}: {e}")
                time.sleep(1)
            else:
                raise


def fmt_number(n: int | float) -> str:
    return f"{n:,}"


# ── Category builders ─────────────────────────────────────────────────────────

def build_countries() -> dict:
    """Fetch top 40 countries by population from REST Countries API."""
    print("Fetching countries...")
    data = fetch_json("https://restcountries.com/v3.1/all?fields=name,population,flags,cca2")

    items = []
    for c in data:
        pop = c.get("population", 0)
        if pop < 300_000:  # skip micro-states
            continue
        cca2 = c.get("cca2", "").lower()
        name = c.get("name", {}).get("common", "Unknown")
        image = f"https://flagcdn.com/w320/{cca2}.png"
        items.append({
            "id": cca2,
            "name": name,
            "value": pop,
            "image": image,
            "hint": f"Population of {name}",
        })

    # Sort by population descending, take top 40
    items.sort(key=lambda x: x["value"], reverse=True)
    items = items[:40]
    print(f"  Got {len(items)} countries.")

    return {
        "id": "countries",
        "label": "Countries by Population",
        "emoji": "🌍",
        "stat": "Population",
        "unit": "",
        "formatSuffix": "",
        "items": items,
    }


def build_pokemon() -> dict:
    """Fetch 35 well-known Pokémon with base stat totals from PokéAPI."""
    print("Fetching Pokémon...")

    # Curated list of recognisable Pokémon by national dex ID
    POKEMON_IDS = [
        1, 3, 6, 9, 25, 39, 94, 129, 130, 133, 143, 147, 148, 149,
        150, 151, 197, 202, 248, 249, 250, 289, 373, 382, 383, 384,
        445, 448, 483, 484, 487, 493, 643, 644, 716, 717,
    ]

    items = []
    for pid in POKEMON_IDS:
        try:
            p = fetch_json(f"https://pokeapi.co/api/v2/pokemon/{pid}")
            total = sum(s["base_stat"] for s in p["stats"])
            name = p["name"].replace("-", " ").title()
            image = p["sprites"]["other"]["official-artwork"]["front_default"]
            if not image:
                image = p["sprites"]["front_default"]
            items.append({
                "id": p["name"],
                "name": name,
                "value": total,
                "image": image,
                "hint": f"Pokémon #{pid}",
            })
            time.sleep(0.3)  # be polite to the free API
        except Exception as e:
            print(f"  Skipped Pokémon #{pid}: {e}")

    print(f"  Got {len(items)} Pokémon.")
    return {
        "id": "pokemon",
        "label": "Pokémon by Base Stats",
        "emoji": "⚡",
        "stat": "Total Base Stats",
        "unit": "",
        "formatSuffix": " pts",
        "items": items,
    }


def build_mountains() -> dict:
    """
    Hardcoded — no free API provides mountain heights + images.
    Images are hotlinked from Wikimedia Commons (CC licensed).
    Update values here when needed.
    """
    print("Building mountains (hardcoded)...")
    items = [
        {"id": "everest", "name": "Mount Everest", "value": 8849, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg/320px-Everest_North_Face_toward_Base_Camp_Tibet_Luca_Galuzzi_2006.jpg", "hint": "Highest peak on Earth, Himalayas"},
        {"id": "k2", "name": "K2", "value": 8611, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/K2_2006b.jpg/320px-K2_2006b.jpg", "hint": "The Savage Mountain, Pakistan"},
        {"id": "kangchenjunga", "name": "Kangchenjunga", "value": 8586, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4E/Kangchenjunga_from_Goechala.jpg/320px-Kangchenjunga_from_Goechala.jpg", "hint": "Third highest, India-Nepal border"},
        {"id": "lhotse", "name": "Lhotse", "value": 8516, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Lhotse_2.jpg/320px-Lhotse_2.jpg", "hint": "Fourth highest, neighbour of Everest"},
        {"id": "makalu", "name": "Makalu", "value": 8485, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Makalu_fromNW.jpg/320px-Makalu_fromNW.jpg", "hint": "Fifth highest, Nepal-Tibet border"},
        {"id": "cho-oyu", "name": "Cho Oyu", "value": 8188, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/ChoOyu_fromGokyo.jpg/320px-ChoOyu_fromGokyo.jpg", "hint": "Sixth highest, Nepal-Tibet border"},
        {"id": "dhaulagiri", "name": "Dhaulagiri", "value": 8167, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Dhaulagiri_from_Thorong_La.jpg/320px-Dhaulagiri_from_Thorong_La.jpg", "hint": "Seventh highest, Nepal"},
        {"id": "manaslu", "name": "Manaslu", "value": 8163, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/ManasluSE_FromGorkha2009.jpg/320px-ManasluSE_FromGorkha2009.jpg", "hint": "Eighth highest, Nepal"},
        {"id": "nanga-parbat", "name": "Nanga Parbat", "value": 8126, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Nanga_Parbat%2C_one_of_the_greatest_mountains.jpg/320px-Nanga_Parbat%2C_one_of_the_greatest_mountains.jpg", "hint": "Killer Mountain, Pakistan"},
        {"id": "annapurna", "name": "Annapurna I", "value": 8091, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Annapurna_massif_from_Tilicho_Lake.jpg/320px-Annapurna_massif_from_Tilicho_Lake.jpg", "hint": "Tenth highest, deadliest 8000er"},
        {"id": "aconcagua", "name": "Aconcagua", "value": 6961, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Aconcagua_South_Face.jpg/320px-Aconcagua_South_Face.jpg", "hint": "Highest peak in South America"},
        {"id": "denali", "name": "Denali", "value": 6190, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Mt_McKinley_reflected_in_Wonder_Lake%2C_2012.jpg/320px-Mt_McKinley_reflected_in_Wonder_Lake%2C_2012.jpg", "hint": "Highest peak in North America, Alaska"},
        {"id": "kilimanjaro", "name": "Kilimanjaro", "value": 5895, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Kilimanjaro_from_amboseli_jan_2013.jpg/320px-Kilimanjaro_from_amboseli_jan_2013.jpg", "hint": "Highest peak in Africa, Tanzania"},
        {"id": "elbrus", "name": "Mount Elbrus", "value": 5642, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Elbrus_2007-07-20_07-38.jpg/320px-Elbrus_2007-07-20_07-38.jpg", "hint": "Highest peak in Europe, Russia"},
        {"id": "mont-blanc", "name": "Mont Blanc", "value": 4808, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Mont_Blanc_depuis_Chamonix%281%29.jpg/320px-Mont_Blanc_depuis_Chamonix%281%29.jpg", "hint": "Highest peak in the Alps"},
        {"id": "matterhorn", "name": "Matterhorn", "value": 4478, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Matterhorn_from_Domh%C3%BCtte_-_2.jpg/320px-Matterhorn_from_Domh%C3%BCtte_-_2.jpg", "hint": "Iconic pyramid peak, Switzerland"},
        {"id": "fuji", "name": "Mount Fuji", "value": 3776, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Mount_Fuji_from_Hotel_Mt_Fuji_1995-6.jpg/320px-Mount_Fuji_from_Hotel_Mt_Fuji_1995-6.jpg", "hint": "Iconic volcano, Japan"},
        {"id": "etna", "name": "Mount Etna", "value": 3357, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Mount_Etna_and_Catania.jpg/320px-Mount_Etna_and_Catania.jpg", "hint": "Active volcano, Sicily"},
        {"id": "olympus", "name": "Mount Olympus", "value": 2917, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Mount_Olympus_Greece.jpg/320px-Mount_Olympus_Greece.jpg", "hint": "Home of the Greek gods"},
        {"id": "ben-nevis", "name": "Ben Nevis", "value": 1345, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Ben_Nevis_from_the_Pap_of_Glencoe.jpg/320px-Ben_Nevis_from_the_Pap_of_Glencoe.jpg", "hint": "Highest peak in the British Isles"},
        {"id": "vesuvius", "name": "Mount Vesuvius", "value": 1281, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Vesuvius_from_plane.jpg/320px-Vesuvius_from_plane.jpg", "hint": "Volcano that buried Pompeii, Italy"},
        {"id": "snowdon", "name": "Snowdon", "value": 1085, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Snowdon_from_Yr_Aran_%28crop%29.jpg/320px-Snowdon_from_Yr_Aran_%28crop%29.jpg", "hint": "Highest peak in Wales"},
        {"id": "table-mountain", "name": "Table Mountain", "value": 1086, "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Cape_Town-Table_Mountain_from_Blaauwberg2.jpg/320px-Cape_Town-Table_Mountain_from_Blaauwberg2.jpg", "hint": "Iconic flat-topped mountain, Cape Town"},
    ]
    print(f"  Built {len(items)} mountains.")
    return {
        "id": "mountains",
        "label": "Mountains by Height",
        "emoji": "🏔️",
        "stat": "Height",
        "unit": "",
        "formatSuffix": " m",
        "items": items,
    }


def build_movies() -> dict:
    """
    Hardcoded with TMDB poster URLs (no API key needed for image CDN access).
    TMDB images require attribution: 'This product uses the TMDB API but is not endorsed by TMDB.'
    Update box office values annually.
    """
    print("Building movies (hardcoded TMDB posters)...")
    items = [
        {"id": "avatar", "name": "Avatar", "value": 2923, "image": "https://image.tmdb.org/t/p/w500/jRXYjXNq0Cs2TcJjLkki24MLp7u.jpg", "hint": "James Cameron's 2009 sci-fi epic"},
        {"id": "avengers-endgame", "name": "Avengers: Endgame", "value": 2799, "image": "https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg", "hint": "Marvel's 2019 superhero epic"},
        {"id": "titanic", "name": "Titanic", "value": 2257, "image": "https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg", "hint": "James Cameron's 1997 romance disaster"},
        {"id": "star-wars-tfa", "name": "Star Wars: The Force Awakens", "value": 2068, "image": "https://image.tmdb.org/t/p/w500/wqnLdwVXoBjKibFRR5U3y0aDUhs.jpg", "hint": "2015 Star Wars sequel"},
        {"id": "avengers-iw", "name": "Avengers: Infinity War", "value": 2048, "image": "https://image.tmdb.org/t/p/w500/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg", "hint": "2018 Marvel snap film"},
        {"id": "spider-man-nwh", "name": "Spider-Man: No Way Home", "value": 1901, "image": "https://image.tmdb.org/t/p/w500/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg", "hint": "2021 multiverse Spider-Man"},
        {"id": "jurassic-world", "name": "Jurassic World", "value": 1671, "image": "https://image.tmdb.org/t/p/w500/jjBgi2r5cRt36xF6iNUHs3v0hjN.jpg", "hint": "2015 dinosaur park sequel"},
        {"id": "lion-king-2019", "name": "The Lion King (2019)", "value": 1663, "image": "https://image.tmdb.org/t/p/w500/2bXbqYdUdNVa8VIWXVfclP2ICtT.jpg", "hint": "Disney's 2019 live-action remake"},
        {"id": "barbie", "name": "Barbie", "value": 1441, "image": "https://image.tmdb.org/t/p/w500/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg", "hint": "2023 Greta Gerwig pink blockbuster"},
        {"id": "furious-7", "name": "Furious 7", "value": 1516, "image": "https://image.tmdb.org/t/p/w500/kkS8PKa8c134D3jIQL9yVd1nFQN.jpg", "hint": "2015 Fast & Furious film"},
        {"id": "frozen-2", "name": "Frozen II", "value": 1450, "image": "https://image.tmdb.org/t/p/w500/pjeMs3yqRmFL3giJy4PMXWZTTPa.jpg", "hint": "2019 Disney animated sequel"},
        {"id": "avengers-2012", "name": "The Avengers (2012)", "value": 1519, "image": "https://image.tmdb.org/t/p/w500/RYMX2wcKCBAr24UyPD7KE3QybEG.jpg", "hint": "First MCU team-up film"},
        {"id": "incredibles-2", "name": "Incredibles 2", "value": 1243, "image": "https://image.tmdb.org/t/p/w500/9slpqxSHsiBrOWnCkvqvIRTfkiB.jpg", "hint": "2018 Pixar superhero sequel"},
        {"id": "iron-man-3", "name": "Iron Man 3", "value": 1215, "image": "https://image.tmdb.org/t/p/w500/qhPtAc1TKbMPqNvcdXSOn9Bn7hZ.jpg", "hint": "2013 Marvel standalone"},
        {"id": "minions", "name": "Minions", "value": 1159, "image": "https://image.tmdb.org/t/p/w500/q0R4crx2SehcEELEHTFLiDpvoPR.jpg", "hint": "2015 animated yellow creatures"},
        {"id": "oppenheimer", "name": "Oppenheimer", "value": 952, "image": "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", "hint": "2023 Nolan's atomic bomb film"},
        {"id": "aquaman", "name": "Aquaman", "value": 1148, "image": "https://image.tmdb.org/t/p/w500/5Kg76ldv7VxeX9YlcQXiowHgdX6.jpg", "hint": "2018 DC underwater epic"},
        {"id": "skyfall", "name": "Skyfall", "value": 1109, "image": "https://image.tmdb.org/t/p/w500/0HbVzGHFe0JLRZ5KTTF7RB0eTH.jpg", "hint": "2012 James Bond film"},
        {"id": "interstellar", "name": "Interstellar", "value": 773, "image": "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", "hint": "2014 Nolan space epic"},
        {"id": "batman-v-superman", "name": "Batman v Superman", "value": 873, "image": "https://image.tmdb.org/t/p/w500/5UsK3grJvtQrtzEgqNlDljJW96w.jpg", "hint": "2016 DC crossover"},
        {"id": "toy-story-4", "name": "Toy Story 4", "value": 1073, "image": "https://image.tmdb.org/t/p/w500/w9kR8qbmQ01HwnvK4alvnQ2ca0L.jpg", "hint": "2019 Pixar sequel"},
        {"id": "parasite", "name": "Parasite", "value": 262, "image": "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", "hint": "2019 Oscar Best Picture winner"},
    ]
    print(f"  Built {len(items)} movies.")
    return {
        "id": "movies",
        "label": "Movies by Box Office",
        "emoji": "🎬",
        "stat": "Box Office",
        "unit": "$",
        "formatSuffix": "M",
        "items": items,
    }


def build_youtubers() -> dict:
    """
    Hardcoded — YouTube API subs change slowly, update quarterly.
    Values are in millions of subscribers.
    """
    print("Building YouTubers (hardcoded)...")
    items = [
        {"id": "mrbeast", "name": "MrBeast", "value": 330, "image": "https://yt3.googleusercontent.com/ytc/AIdro_nMCBSMIFbK-d6vVpBcRhq7V0TvG-lGiBjjxuGizxRIKSE=s240-c-k-c0x00ffffff-no-rj", "hint": "Most subscribed individual creator"},
        {"id": "t-series", "name": "T-Series", "value": 270, "image": "https://yt3.googleusercontent.com/ytc/AIdro_kL_SBdLlCKjZrJbJqZMoC2jlF4OQPQD5tD2JW2zRE=s240-c-k-c0x00ffffff-no-rj", "hint": "Indian music label and film studio"},
        {"id": "cocomelon", "name": "Cocomelon", "value": 180, "image": "https://yt3.googleusercontent.com/ytc/AIdro_mLfYzlLRj_dOLU7j3-0_JElGbdmSSRiJT23hfAl0s=s240-c-k-c0x00ffffff-no-rj", "hint": "Nursery rhymes channel for kids"},
        {"id": "set-india", "name": "SET India", "value": 175, "image": "https://yt3.googleusercontent.com/ytc/AIdro_k3C9MNqmvnFuJR-qrNzOg4rZqQpjF7RNPJ7KRz=s240-c-k-c0x00ffffff-no-rj", "hint": "Sony Entertainment Television India"},
        {"id": "pewdiepie", "name": "PewDiePie", "value": 111, "image": "https://yt3.googleusercontent.com/ytc/AIdro_mIMB9uXJ4_bYNiQiXkU8m7bL-pFmZKjkDSc0nU=s240-c-k-c0x00ffffff-no-rj", "hint": "Swedish creator, long-time #1 individual"},
        {"id": "like-nastya", "name": "Like Nastya", "value": 118, "image": "https://yt3.googleusercontent.com/ytc/AIdro_lJBMIX48GFT8FRz-jS7RDN-EtBKVnJa3sE0ZF1=s240-c-k-c0x00ffffff-no-rj", "hint": "Russian child creator"},
        {"id": "vlad-niki", "name": "Vlad and Niki", "value": 116, "image": "https://yt3.googleusercontent.com/ytc/AIdro_ln8SXK1LQnuB34T_mOwqbEFEYIGCL5X7yvFjNj=s240-c-k-c0x00ffffff-no-rj", "hint": "Kids toy and play channel"},
        {"id": "justin-bieber", "name": "Justin Bieber", "value": 73, "image": "https://yt3.googleusercontent.com/ytc/AIdro_lPZ0B6Pl1TRSPr6i5tAlQoJCjYp4o-n9qRXOSq=s240-c-k-c0x00ffffff-no-rj", "hint": "Canadian pop star"},
        {"id": "taylor-swift", "name": "Taylor Swift", "value": 59, "image": "https://yt3.googleusercontent.com/ytc/AIdro_kIpgQGxXpVOxPJJ0pDvmkN-J9_qHF4gXKAlXX6=s240-c-k-c0x00ffffff-no-rj", "hint": "Country-pop megastar"},
        {"id": "eminem", "name": "Eminem", "value": 52, "image": "https://yt3.googleusercontent.com/ytc/AIdro_kj12P8bQ3WOqxDmqpHSqt8aM6QpCyNfnDRrE=s240-c-k-c0x00ffffff-no-rj", "hint": "Slim Shady, Detroit rapper"},
        {"id": "ed-sheeran", "name": "Ed Sheeran", "value": 56, "image": "https://yt3.googleusercontent.com/ytc/AIdro_ln5cRLf2Bv4CJjmKs4C1pFYi5Q4lYqsLz9aEaD=s240-c-k-c0x00ffffff-no-rj", "hint": "British singer-songwriter"},
        {"id": "dude-perfect", "name": "Dude Perfect", "value": 60, "image": "https://yt3.googleusercontent.com/ytc/AIdro_mO4SIAMq0y6gRfT0b0A-uXLFjXc_VF4RTJI9gy=s240-c-k-c0x00ffffff-no-rj", "hint": "Sports entertainment group"},
        {"id": "bad-bunny", "name": "Bad Bunny", "value": 45, "image": "https://yt3.googleusercontent.com/ytc/AIdro_kcGJlYuSYSVmIJRq2pA8X5cKNxcRniJXxvTpso=s240-c-k-c0x00ffffff-no-rj", "hint": "Puerto Rican reggaeton star"},
        {"id": "mark-rober", "name": "Mark Rober", "value": 48, "image": "https://yt3.googleusercontent.com/ytc/AIdro_mNYV17bbbBpJxA1mFiHJEh-0I0psFt8cL5IHE=s240-c-k-c0x00ffffff-no-rj", "hint": "Former NASA engineer"},
        {"id": "drake", "name": "Drake", "value": 35, "image": "https://yt3.googleusercontent.com/ytc/AIdro_mp8JiUhH3-LHpZ0FE3VkFgTaZJWQwB2FSmZYz2=s240-c-k-c0x00ffffff-no-rj", "hint": "Canadian hip-hop artist"},
        {"id": "kurzgesagt", "name": "Kurzgesagt", "value": 24, "image": "https://yt3.googleusercontent.com/ytc/AIdro_nCzJd6CXKECuZAT04LXRDaUXnLdCTNH2-aBJ9HgA=s240-c-k-c0x00ffffff-no-rj", "hint": "In a Nutshell animated education"},
        {"id": "vsauce", "name": "Vsauce", "value": 22, "image": "https://yt3.googleusercontent.com/ytc/AIdro_kxqmV7TyXjZ0KQJN8jmScxz5YE1ZBwUvEF5mRI=s240-c-k-c0x00ffffff-no-rj", "hint": "Educational science channel"},
        {"id": "veritasium", "name": "Veritasium", "value": 16, "image": "https://yt3.googleusercontent.com/ytc/AIdro_mMDe9bx_jRCHi6hT8JwRN5vQYxjq0CXb2FiGLt=s240-c-k-c0x00ffffff-no-rj", "hint": "Science and engineering videos"},
        {"id": "linus-tech-tips", "name": "Linus Tech Tips", "value": 16, "image": "https://yt3.googleusercontent.com/ytc/AIdro_n0F_rXRFVjZE4vS9fMl3iVo4S3SH62FvWZbCi7=s240-c-k-c0x00ffffff-no-rj", "hint": "Canadian tech review channel"},
        {"id": "coldplay", "name": "Coldplay", "value": 33, "image": "https://yt3.googleusercontent.com/ytc/AIdro_lQl0jNXH84yGvXuuXGpQtibD6FXjqVHEJiVfm0=s240-c-k-c0x00ffffff-no-rj", "hint": "British rock band"},
    ]
    print(f"  Built {len(items)} YouTubers.")
    return {
        "id": "youtubers",
        "label": "YouTubers by Subscribers",
        "emoji": "▶️",
        "stat": "Subscribers",
        "unit": "",
        "formatSuffix": "M",
        "items": items,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== Generating higherOrLower.json ===\n")

    categories = []

    # Countries — live API
    try:
        categories.append(build_countries())
    except Exception as e:
        print(f"  ERROR building countries: {e}. Skipping.")

    # Movies — hardcoded
    categories.append(build_movies())

    # Pokémon — live API
    try:
        categories.append(build_pokemon())
    except Exception as e:
        print(f"  ERROR building Pokémon: {e}. Skipping.")

    # Mountains — hardcoded
    categories.append(build_mountains())

    # YouTubers — hardcoded
    categories.append(build_youtubers())

    output = {"categories": categories}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    total_items = sum(len(c["items"]) for c in categories)
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"\n✅ Done! {len(categories)} categories, {total_items} items, {size_kb:.1f} KB → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
