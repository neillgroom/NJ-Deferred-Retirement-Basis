# NJ Deferred Retirement Basis Tracker

A zero-dependency, local desktop utility and web dashboard designed to track and reconstruct New Jersey Gross Income Tax (and PA/MA) retirement account tax basis. 

In New Jersey, employee contributions to Traditional IRAs, 403(b)s, 457(b)s, and SEP/SIMPLE IRAs are taxed in the year they are made (non-deductible). This utility tracks your running state tax basis to ensure you are not double-taxed on distributions in retirement.

---

## Features

*   **State Taxation Engines:**
    *   **New Jersey (NJ):** Runs the pro-rata **Worksheet C** basis recovery calculations.
    *   **Pennsylvania (PA):** Implements **FIFO Cost Recovery** for early/non-qualified distributions. Qualified retirement distributions are marked as tax-exempt.
    *   **Massachusetts (MA):** Runs pro-rata Traditional IRA basis recovery.
*   **Smart Document & Transcript Parser:** Drag and drop or copy-paste text from W-2s, Form 5498s, Form 1099-Rs, or IRS Wage & Income Transcripts. The tool automatically parses and extracts taxable vs. FICA wages to isolate your state basis additions.
*   **Excel / Google Sheets Integration:**
    *   Export your computed basis roll-forward ledger to an Excel-compatible CSV.
    *   Import historical contributions from a simple CSV format.
    *   Includes a pre-formulated Excel template (`basis_recovery_sheet.xlsx`) for offline manual calculations.

---

## Getting Started

### Prerequisites
*   Python 3.x (Uses only the standard library, no packages required to run the server).

### How to Run
1.  Clone this repository to your local machine.
2.  Navigate to the directory:
    ```bash
    cd "NJ Deferred Retirement Basis"
    ```
3.  Launch the local server:
    ```bash
    python app.py
    ```
4.  The application will automatically launch the dashboard in your default browser at `http://localhost:8080`.

---

## Project Structure

*   `app.py` - Lightweight Python backend serving static files and local JSON/CSV APIs.
*   `index.html` - HTML5 dashboard structure and triage instructions.
*   `app.css` - Light-theme dashboard styles.
*   `tracker.js` - Client-side state controllers and calculation engines.
*   `generate_basis_sheet.py` - Script to generate the formulated Excel workbook.
*   `basis_recovery_sheet.xlsx` - Formulated Excel workbook with active Worksheet C and PA Cost Recovery equations.
*   `.gitignore` - Prevents committing local data files.
