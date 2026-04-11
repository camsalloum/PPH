#!/usr/bin/env python3
"""
PDF to Excel Converter
Extracts tables from PDF and converts to Excel format
"""

import sys
import os

def convert_pdf_to_excel(pdf_path, output_path=None):
    """
    Convert PDF to Excel using tabula-py
    
    Args:
        pdf_path: Path to input PDF file
        output_path: Path to output Excel file (optional)
    """
    try:
        # Try importing tabula
        import tabula
    except ImportError:
        print("❌ Error: tabula-py is not installed")
        print("\nTo install, run:")
        print("  pip install tabula-py")
        print("\nNote: You also need Java installed on your system")
        return False
    
    try:
        # Check if file exists
        if not os.path.exists(pdf_path):
            print(f"❌ Error: File not found: {pdf_path}")
            return False
        
        # Generate output filename if not provided
        if output_path is None:
            base_name = os.path.splitext(pdf_path)[0]
            output_path = f"{base_name}.xlsx"
        
        print(f"📄 Reading PDF: {pdf_path}")
        print(f"📊 Converting to Excel: {output_path}")
        print("\nThis may take a moment...")
        
        # Extract all tables from PDF
        # pages='all' extracts from all pages
        # multiple_tables=True handles multiple tables per page
        tables = tabula.read_pdf(
            pdf_path,
            pages='all',
            multiple_tables=True,
            lattice=True  # Use lattice mode for better table detection
        )
        
        if not tables:
            print("⚠️ Warning: No tables found in PDF")
            return False
        
        print(f"\n✅ Found {len(tables)} table(s)")
        
        # Write to Excel
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            for i, table in enumerate(tables, 1):
                sheet_name = f"Table_{i}"
                print(f"  → Writing {sheet_name} ({len(table)} rows)")
                table.to_excel(writer, sheet_name=sheet_name, index=False)
        
        print(f"\n✅ Success! Excel file created: {output_path}")
        return True
        
    except Exception as e:
        print(f"\n❌ Error during conversion: {str(e)}")
        return False

def convert_pdf_to_excel_alternative(pdf_path, output_path=None):
    """
    Alternative method using pdfplumber (better for complex PDFs)
    """
    try:
        import pdfplumber
        import pandas as pd
    except ImportError:
        print("❌ Error: pdfplumber or pandas is not installed")
        print("\nTo install, run:")
        print("  pip install pdfplumber pandas openpyxl")
        return False
    
    try:
        if not os.path.exists(pdf_path):
            print(f"❌ Error: File not found: {pdf_path}")
            return False
        
        if output_path is None:
            base_name = os.path.splitext(pdf_path)[0]
            output_path = f"{base_name}.xlsx"
        
        print(f"📄 Reading PDF: {pdf_path}")
        print(f"📊 Converting to Excel: {output_path}")
        print("\nExtracting tables using pdfplumber...")
        
        all_tables = []
        
        with pdfplumber.open(pdf_path) as pdf:
            print(f"  → Found {len(pdf.pages)} pages")
            
            for page_num, page in enumerate(pdf.pages, 1):
                print(f"  → Processing page {page_num}...")
                tables = page.extract_tables()
                
                for table_num, table in enumerate(tables, 1):
                    if table:
                        df = pd.DataFrame(table[1:], columns=table[0])
                        all_tables.append((f"Page{page_num}_Table{table_num}", df))
        
        if not all_tables:
            print("⚠️ Warning: No tables found in PDF")
            return False
        
        print(f"\n✅ Found {len(all_tables)} table(s)")
        
        # Write to Excel
        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            for sheet_name, df in all_tables:
                print(f"  → Writing {sheet_name} ({len(df)} rows)")
                df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        print(f"\n✅ Success! Excel file created: {output_path}")
        return True
        
    except Exception as e:
        print(f"\n❌ Error during conversion: {str(e)}")
        return False

if __name__ == "__main__":
    # Check if pandas is available
    try:
        import pandas as pd
    except ImportError:
        print("❌ Error: pandas is not installed")
        print("\nTo install required packages, run:")
        print("  pip install pandas openpyxl pdfplumber")
        sys.exit(1)
    
    # Get PDF path from command line or use default
    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
    else:
        pdf_path = r"D:\PPH 26.01\Flexible Packaging  Projected PL 2026 to 2029   ( working dated  21 01 2026 ) (003).pdf"
    
    # Get output path if provided
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    print("=" * 60)
    print("PDF to Excel Converter")
    print("=" * 60)
    
    # Try pdfplumber first (more reliable)
    print("\n🔄 Method 1: Using pdfplumber...")
    success = convert_pdf_to_excel_alternative(pdf_path, output_path)
    
    if not success:
        print("\n🔄 Method 2: Trying tabula-py...")
        success = convert_pdf_to_excel(pdf_path, output_path)
    
    if not success:
        print("\n" + "=" * 60)
        print("❌ Conversion failed")
        print("=" * 60)
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("✅ Conversion completed successfully!")
    print("=" * 60)
