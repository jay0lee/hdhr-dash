#!/usr/bin/env python3
"""
generate-stations.py
Generates stations.json mapping station call signs to [locality, affiliate].
Pulls from Wikipedia affiliate tables, applies manual overrides, and minifies output.
Standard library only (no external pip dependencies).
"""

import json
import os
import re
import sys
import urllib.request
from html.parser import HTMLParser

USER_AGENT = "hdhr-dash-station-generator/1.0 (https://github.com/jay0lee/hdhr-dash)"

US_STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
    "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ",
    "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
    "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
    "District of Columbia": "DC", "Puerto Rico": "PR", "Guam": "GU", "U.S. Virgin Islands": "VI",
    "American Samoa": "AS", "Northern Mariana Islands": "MP"
}

CA_PROVINCES = {
    "Alberta": "AB", "British Columbia": "BC", "Manitoba": "MB", "New Brunswick": "NB",
    "Newfoundland and Labrador": "NL", "Northwest Territories": "NT", "Nova Scotia": "NS",
    "Nunavut": "NU", "Ontario": "ON", "Prince Edward Island": "PE", "Quebec": "QC",
    "Saskatchewan": "SK", "Yukon": "YT"
}

SOURCES = [
    {"network": "ABC", "url": "https://en.wikipedia.org/wiki/List_of_American_Broadcasting_Company_television_affiliates"},
    {"network": "CBS", "url": "https://en.wikipedia.org/wiki/List_of_CBS_television_affiliates_(table)"},
    {"network": "NBC", "url": "https://en.wikipedia.org/wiki/List_of_NBC_television_affiliates_(table)"},
    {"network": "FOX", "url": "https://en.wikipedia.org/wiki/List_of_Fox_television_affiliates_(table)"},
    {"network": "CW", "url": "https://en.wikipedia.org/wiki/List_of_The_CW_affiliates"},
    {"network": "PBS", "url": "https://en.wikipedia.org/wiki/List_of_PBS_member_stations"},
    {"network": "CTV", "url": "https://en.wikipedia.org/wiki/CTV_Television_Network"},
    {"network": "CBC", "url": "https://en.wikipedia.org/wiki/List_of_CBC_Television_stations"},
    {"network": "Global", "url": "https://en.wikipedia.org/wiki/Global_Television_Network"},
    {"network": "Citytv", "url": "https://en.wikipedia.org/wiki/Citytv"},
]


def safe_int(val, default=1):
    """Safely extract integer from attribute strings like '5” ' or ' 2 '."""
    if not val:
        return default
    m = re.search(r'\d+', str(val))
    return int(m.group(0)) if m else default


class WikiTableParser(HTMLParser):
    """Parses wikitables and handles rowspan/colspan into a 2D matrix of text."""
    def __init__(self):
        super().__init__()
        self.tables = []
        self.current_table = None
        self.in_table = False
        self.current_row = None
        self.in_cell = False
        self.cell_text = []
        self.cell_rowspan = 1
        self.cell_colspan = 1

    def handle_starttag(self, tag, attrs):
        attr_dict = dict(attrs)
        if tag == "table" and "wikitable" in attr_dict.get("class", ""):
            self.in_table = True
            self.current_table = []
        elif self.in_table:
            if tag == "tr":
                self.current_row = []
            elif tag in ("td", "th"):
                self.in_cell = True
                self.cell_text = []
                self.cell_rowspan = safe_int(attr_dict.get("rowspan", 1), 1)
                self.cell_colspan = safe_int(attr_dict.get("colspan", 1), 1)

    def handle_data(self, data):
        if self.in_cell:
            self.cell_text.append(data)

    def handle_endtag(self, tag):
        if self.in_table:
            if tag in ("td", "th"):
                self.in_cell = False
                text = "".join(self.cell_text).strip()
                self.current_row.append({
                    "text": text,
                    "rowspan": self.cell_rowspan,
                    "colspan": self.cell_colspan
                })
            elif tag == "tr":
                if self.current_row:
                    self.current_table.append(self.current_row)
                    self.current_row = None
            elif tag == "table":
                self.in_table = False
                if self.current_table:
                    self.tables.append(self.normalize_table(self.current_table))
                    self.current_table = None

    @staticmethod
    def normalize_table(raw_rows):
        """Expand rowspans and colspans into a regular 2D grid of strings."""
        grid = []
        rowspan_trackers = {}  # col_idx -> (remaining_rows, text)

        for row in raw_rows:
            grid_row = []
            col_idx = 0
            raw_cell_idx = 0

            while raw_cell_idx < len(row) or col_idx in rowspan_trackers:
                # If there's an active rowspan for this column, use it
                if col_idx in rowspan_trackers:
                    remaining, val = rowspan_trackers[col_idx]
                    grid_row.append(val)
                    if remaining <= 1:
                        del rowspan_trackers[col_idx]
                    else:
                        rowspan_trackers[col_idx] = (remaining - 1, val)
                    col_idx += 1
                    continue

                if raw_cell_idx < len(row):
                    cell = row[raw_cell_idx]
                    raw_cell_idx += 1
                    text = cell["text"]
                    r_span = cell["rowspan"]
                    c_span = cell["colspan"]

                    for c in range(c_span):
                        actual_col = col_idx + c
                        grid_row.append(text)
                        if r_span > 1:
                            rowspan_trackers[actual_col] = (r_span - 1, text)

                    col_idx += c_span

            grid.append(grid_row)
        return grid


def extract_callsigns(raw):
    """Find all valid call signs in a text string (e.g. 'WPVI', 'WCAU-TV', 'WTIU / WIPB')."""
    if not raw:
        return []
    # Strip footnotes e.g. [1], [a], [iv]
    cleaned = re.sub(r'\[.*?\]', '', raw).strip()
    # Match 3-5 uppercase letters starting with W, K, or C (standard North American broadcast)
    # Exclude common abbreviations like NYC, USA, CBS, NBC, FOX, PBS, etc.
    EXCLUDE = {"USA", "NYC", "ABC", "CBS", "NBC", "FOX", "PBS", "THE", "AND", "SEE", "NEW", "CTV", "CBC", "DMA"}
    matches = re.findall(r'\b([WK|C][A-Z]{2,4})(?:-|\.|\s)?(?:HD|DT|TV|CD|LD|SD)?\b', cleaned, re.IGNORECASE)
    results = []
    for m in matches:
        call = m.upper()
        # Ensure it starts with W, K, or C
        if call[0] in ('W', 'K', 'C') and call not in EXCLUDE and 3 <= len(call) <= 5:
            results.append(call)
    return results


def clean_state(raw):
    """Convert full state or province name to 2-letter postal code."""
    if not raw:
        return ""
    cleaned = re.sub(r'\[.*?\]', '', raw).strip()
    # Check if a known state name is inside the string
    for state_name, code in US_STATES.items():
        if state_name.lower() in cleaned.lower():
            return code
    for prov_name, code in CA_PROVINCES.items():
        if prov_name.lower() in cleaned.lower():
            return code
    # Check if already 2-letter abbreviation
    m = re.search(r'\b([A-Z]{2})\b', cleaned)
    if m and (m.group(1) in US_STATES.values() or m.group(1) in CA_PROVINCES.values()):
        return m.group(1)
    return cleaned


def clean_city(raw):
    """Clean city name, stripping footnotes and extra text."""
    if not raw:
        return ""
    cleaned = re.sub(r'\[.*?\]', '', raw).strip()
    # Strip trailing parentheticals e.g. "Springfield (Holyoke)" -> "Springfield"
    cleaned = re.sub(r'\(.*?\)', '', cleaned).strip()
    # Take first line if multiline
    cleaned = cleaned.split('\n')[0].strip()
    return cleaned


def fetch_url(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_source_tables(network, html):
    parser = WikiTableParser()
    parser.feed(html)
    results = {}

    for table in parser.tables:
        if not table or len(table) < 2:
            continue

        header = [h.lower() for h in table[0]]
        call_col = -1
        city_col = -1
        state_col = -1

        for idx, h in enumerate(header):
            if "station" in h or "call sign" in h or "callsign" in h:
                call_col = idx
            elif "city" in h or "market" in h or "community" in h or "location" in h:
                city_col = idx
            elif "state" in h or "province" in h or "dist" in h or "terr" in h:
                state_col = idx

        # Fallback heuristic if headers are atypical
        if call_col == -1:
            for col_idx in range(len(table[0])):
                sample_calls = []
                for row in table[1:8]:
                    if col_idx < len(row):
                        sample_calls.extend(extract_callsigns(row[col_idx]))
                if len(sample_calls) >= 3:
                    call_col = col_idx
                    break

        if call_col == -1:
            continue

        if city_col == -1:
            city_col = 0 if call_col != 0 else 1

        for row in table[1:]:
            if call_col >= len(row):
                continue
            raw_call = row[call_col]
            calls = extract_callsigns(raw_call)
            if not calls:
                continue

            raw_city = row[city_col] if city_col < len(row) else ""
            raw_state = row[state_col] if (state_col != -1 and state_col < len(row)) else ""

            city = clean_city(raw_city)
            state_code = clean_state(raw_state)

            if state_code and city:
                locality = f"{city}, {state_code}"
            elif city:
                locality = city
            elif state_code:
                locality = state_code
            else:
                locality = ""

            for call in calls:
                results[call] = [locality, network]

    return results


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    overrides_file = os.path.join(base_dir, "scripts", "station-overrides.json")
    output_file = os.path.join(base_dir, "stations.json")

    all_stations = {}

    print("Fetching and parsing television affiliate lists from Wikipedia...")
    for src in SOURCES:
        net = src["network"]
        url = src["url"]
        print(f"  -> Fetching {net} from {url}...")
        try:
            html = fetch_url(url)
            stations = parse_source_tables(net, html)
            print(f"     Found {len(stations)} stations for {net}.")
            all_stations.update(stations)
        except Exception as e:
            print(f"     [ERROR] Failed to fetch/parse {net}: {e}", file=sys.stderr)

    # Load and apply manual overrides
    if os.path.exists(overrides_file):
        try:
            with open(overrides_file, "r", encoding="utf-8") as f:
                overrides = json.load(f)
            override_count = 0
            for call, data in overrides.items():
                call_clean = extract_callsigns(call)
                k = call_clean[0] if call_clean else call.upper()
                all_stations[k] = data
                override_count += 1
            print(f"Applied {override_count} manual station overrides from {overrides_file}.")
        except Exception as e:
            print(f"Warning: Failed to load overrides file: {e}", file=sys.stderr)

    # Sort keys alphabetically for clean diffs
    sorted_stations = {k: all_stations[k] for k in sorted(all_stations.keys())}

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(sorted_stations, f, separators=(',', ':'), ensure_ascii=False)

    size_bytes = os.path.getsize(output_file)
    print(f"\nSuccessfully generated {output_file}:")
    print(f"  Total Stations: {len(sorted_stations)}")
    print(f"  File Size: {size_bytes / 1024:.1f} KB")


if __name__ == "__main__":
    main()
