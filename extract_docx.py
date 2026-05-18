import zipfile
import xml.etree.ElementTree as ET
import sys

def get_docx_text(path):
    try:
        document = zipfile.ZipFile(path)
        xml_content = document.read('word/document.xml')
        document.close()
        tree = ET.fromstring(xml_content)
        
        # Docx XML uses namespaces
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text = ""
        for paragraph in tree.findall('.//w:p', ns):
            for run in paragraph.findall('.//w:t', ns):
                if run.text:
                    text += run.text
            text += "\n"
        return text
    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) > 1:
        text = get_docx_text(sys.argv[1])
        with open('proposal.md', 'w', encoding='utf-8') as f:
            f.write(text)
        print("Extracted to proposal.md")
    else:
        print("Usage: python script.py <path_to_docx>")
