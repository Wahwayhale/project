#!/usr/bin/env python3
"""Extract CSS sections to files and replace with @import statements."""
import sys

def extract_and_replace(css_file, section_ranges, output_file, import_line):
    """Extract line ranges from css_file to output_file, replace with import_line.

    section_ranges: list of (start, end) 1-based inclusive line ranges
    """
    with open(css_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Collect all lines to extract
    extracted = []
    to_delete = set()
    for start, end in section_ranges:
        for i in range(start - 1, end):
            to_delete.add(i)
            extracted.append(lines[i])

    # Write extracted content
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(extracted)

    # Build new content: keep non-deleted lines, insert import at first deletion point
    new_lines = []
    first_import_inserted = False
    first_del = min(to_delete) if to_delete else -1

    for i, line in enumerate(lines):
        if i in to_delete:
            if not first_import_inserted:
                new_lines.append(import_line + '\n')
                first_import_inserted = True
            continue
        new_lines.append(line)

    # If no lines were deleted (shouldn't happen), add import at top
    if not first_import_inserted:
        new_lines.insert(0, import_line + '\n')

    with open(css_file, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    return len(extracted)

if __name__ == '__main__':
    # Usage: python extract_css.py <css_file> <start>-<end>[,<start>-<end>...] <output_file> <import_line>
    css_file = sys.argv[1]

    # Parse ranges like "7-57" or "61-440,1322-1336,1825-1948"
    ranges_str = sys.argv[2]
    section_ranges = []
    for r in ranges_str.split(','):
        start, end = r.split('-')
        section_ranges.append((int(start), int(end)))

    output_file = sys.argv[3]
    import_line = sys.argv[4]

    count = extract_and_replace(css_file, section_ranges, output_file, import_line)
    print(f"Extracted {count} lines to {output_file}")
    print(f"Replaced in {css_file} with: {import_line}")
