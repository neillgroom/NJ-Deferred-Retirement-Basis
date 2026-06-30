// State variables
let activeAccount = "";
let activeState = "NJ"; // NJ, PA, MA
let appData = { accounts: {} };

// DOM Elements
const accountSelect = document.getElementById("account-select");
const btnNewAccount = document.getElementById("btn-new-account");
const newAccountCard = document.getElementById("new-account-card");
const newAccountName = document.getElementById("new-account-name");
const newAccountType = document.getElementById("new-account-type");
const btnSaveAccount = document.getElementById("btn-save-account");
const btnCancelAccount = document.getElementById("btn-cancel-account");

const transactionForm = document.getElementById("transaction-form");
const txType = document.getElementById("tx-type");
const txYear = document.getElementById("tx-year");
const txAmount = document.getElementById("tx-amount");
const dec31Group = document.getElementById("dec31-group");
const txDec31 = document.getElementById("tx-dec31");
const txNote = document.getElementById("tx-note");

const btnExportCsv = document.getElementById("btn-export-csv");
const importCsvText = document.getElementById("import-csv-text");
const btnImportCsv = document.getElementById("btn-import-csv");

const statTotalContribs = document.getElementById("stat-total-contribs");
const statUnrecoveredBasis = document.getElementById("stat-unrecovered-basis");
const statRecoveredBasis = document.getElementById("stat-recovered-basis");

const stateTabs = document.querySelectorAll(".state-tab");
const ruleDescs = {
    NJ: document.getElementById("rule-desc-nj"),
    PA: document.getElementById("rule-desc-pa"),
    MA: document.getElementById("rule-desc-ma")
};
const activeStateLabel = document.getElementById("active-state-label");
const ledgerTableBody = document.querySelector("#ledger-table tbody");
const transactionsTableBody = document.querySelector("#transactions-table tbody");

// Dropzone & Parser DOM elements
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const pasteText = document.getElementById("paste-text");
const parserResult = document.getElementById("parser-result");
const btnParseText = document.getElementById("btn-parse-text");

// Lifecycle setup
document.addEventListener("DOMContentLoaded", () => {
    fetchLedger();
    bindEvents();
});

// Event Bindings
function bindEvents() {
    // Account Selector
    accountSelect.addEventListener("change", (e) => {
        activeAccount = e.target.value;
        renderDashboard();
    });

    // Account Creation toggle
    btnNewAccount.addEventListener("click", () => {
        newAccountCard.classList.remove("hidden");
    });
    btnCancelAccount.addEventListener("click", () => {
        newAccountCard.classList.add("hidden");
        newAccountName.value = "";
    });
    btnSaveAccount.addEventListener("click", createAccount);

    // Toggle Dec 31 value field based on transaction type (only withdrawals need Dec 31 balance)
    txType.addEventListener("change", (e) => {
        if (e.target.value === "withdrawal") {
            dec31Group.classList.remove("hidden");
            txDec31.setAttribute("required", "true");
        } else {
            dec31Group.classList.add("hidden");
            txDec31.removeAttribute("required");
            txDec31.value = "";
        }
    });

    // Transaction form submission
    transactionForm.addEventListener("submit", addTransaction);

    // CSV Import / Export
    btnExportCsv.addEventListener("click", exportCSV);
    btnImportCsv.addEventListener("click", importCSV);

    // State taxation switcher tabs
    stateTabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            stateTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            activeState = tab.dataset.state;
            activeStateLabel.textContent = activeState;
            
            // Switch rules help text
            Object.keys(ruleDescs).forEach(key => {
                if (key === activeState) {
                    ruleDescs[key].classList.remove("hidden");
                } else {
                    ruleDescs[key].classList.add("hidden");
                }
            });

            renderDashboard();
        });
    });

    // Drag-and-drop / Upload Trigger
    dropzone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFileSelect);

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
        }
    });

    // Parse button
    btnParseText.addEventListener("click", () => {
        const text = pasteText.value.trim();
        if (!text) return alert("Please paste document text or upload a file first.");
        executeTriageParser(text);
    });
}

// Fetch ledger data from Local Server API
async function fetchLedger() {
    try {
        const response = await fetch("/api/ledger");
        if (response.ok) {
            appData = await response.json();
            populateAccountDropdown();
            renderDashboard();
        }
    } catch (e) {
        console.error("Error loading basis ledger data:", e);
    }
}

// Populate dropdown list with accounts
function populateAccountDropdown() {
    const previousSelection = accountSelect.value;
    accountSelect.innerHTML = '<option value="" disabled>Select or create an account...</option>';
    
    const accounts = Object.keys(appData.accounts);
    accounts.forEach(acc => {
        const opt = document.createElement("option");
        opt.value = acc;
        opt.textContent = `${acc} (${appData.accounts[acc].type})`;
        accountSelect.appendChild(opt);
    });

    // Restore selection or default to first account
    if (accounts.includes(previousSelection)) {
        accountSelect.value = previousSelection;
        activeAccount = previousSelection;
    } else if (accounts.length > 0) {
        accountSelect.value = accounts[0];
        activeAccount = accounts[0];
    } else {
        activeAccount = "";
    }
}

// Create new account
async function createAccount() {
    const name = newAccountName.value.trim();
    const type = newAccountType.value;
    if (!name) return alert("Account name is required.");

    // Simple hack to trigger registration by adding a dummy $0 contribution
    try {
        const response = await fetch("/api/transaction/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                account: name,
                type: type,
                year: new Date().getFullYear(),
                tx_type: "contribution",
                amount: 0,
                note: "Account Initialized"
            })
        });

        if (response.ok) {
            newAccountName.value = "";
            newAccountCard.classList.add("hidden");
            activeAccount = name;
            await fetchLedger();
        }
    } catch (e) {
        console.error(e);
    }
}

// Add transaction via API
async function addTransaction(e) {
    e.preventDefault();
    if (!activeAccount) return alert("Please select or create an account first.");

    const year = parseInt(txYear.value);
    const amount = parseFloat(txAmount.value);
    const type = txType.value;
    const dec31 = parseFloat(txDec31.value) || 0.0;
    const note = txNote.value.trim();

    if (isNaN(year) || isNaN(amount)) return alert("Please enter valid year and amount.");

    try {
        const response = await fetch("/api/transaction/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                account: activeAccount,
                year: year,
                tx_type: type,
                amount: amount,
                dec_31_value: dec31,
                note: note
            })
        });

        if (response.ok) {
            // Reset input values
            txYear.value = "";
            txAmount.value = "";
            txDec31.value = "";
            txNote.value = "";
            await fetchLedger();
        }
    } catch (e) {
        console.error(e);
    }
}

// Delete transaction
async function deleteTransaction(index) {
    if (!confirm("Are you sure you want to delete this transaction record?")) return;

    try {
        const response = await fetch("/api/transaction/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                account: activeAccount,
                index: index
            })
        });

        if (response.ok) {
            await fetchLedger();
        }
    } catch (e) {
        console.error(e);
    }
}

// Import CSV contributions
async function importCSV() {
    if (!activeAccount) return alert("Please select an account first.");
    const text = importCsvText.value.trim();
    if (!text) return alert("Please enter CSV text to import.");

    try {
        const response = await fetch("/api/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                account: activeAccount,
                csv_text: text
            })
        });

        if (response.ok) {
            const res = await response.json();
            alert(`Imported ${res.count} transactions successfully.`);
            importCsvText.value = "";
            await fetchLedger();
        }
    } catch (e) {
        console.error(e);
    }
}

// Trigger CSV export download
function exportCSV() {
    if (!activeAccount) return alert("Please select an account first.");
    window.location = `/api/export?account=${encodeURIComponent(activeAccount)}`;
}

// Recalculate Roll-Forward Basis table depending on state rules
function calculateRollForward(transactions, state) {
    // Sort transactions chronologically
    const sortedTxs = [...transactions].sort((a, b) => {
        const typeOrder = a.type === "contribution" ? 0 : 1;
        return a.year - b.year || typeOrder;
    });

    const years = [...new Set(sortedTxs.map(t => t.year))].sort((a, b) => a - b);
    
    let currentBasis = 0.0;
    const history = [];

    for (let yr of years) {
        const yearTxs = sortedTxs.filter(t => t.year === yr);
        
        // Sum contributions (basis increases)
        const contribs = yearTxs
            .filter(t => t.type === "contribution")
            .reduce((sum, t) => sum + t.amount, 0.0);
            
        const startingBasis = currentBasis;
        const basisBeforeWithdrawal = startingBasis + contribs;
        
        const withdrawals = yearTxs.filter(t => t.type === "withdrawal");
        
        let totalWithdrawn = 0.0;
        let taxablePortion = 0.0;
        let excludablePortion = 0.0;
        let dec31Val = 0.0;

        if (withdrawals.length > 0) {
            totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0.0);
            dec31Val = withdrawals[withdrawals.length - 1].dec_31_value;
            
            const totalValue = dec31Val + totalWithdrawn;
            
            if (state === "NJ" || state === "MA") {
                // NJ & MA Pro-Rata Model (Worksheet C)
                if (totalValue > 0) {
                    const effectiveBasis = Math.min(basisBeforeWithdrawal, totalValue);
                    excludablePortion = totalWithdrawn * (effectiveBasis / totalValue);
                    // Round to cents
                    excludablePortion = Math.round(excludablePortion * 100) / 100;
                    taxablePortion = Math.max(0.0, totalWithdrawn - excludablePortion);
                } else {
                    excludablePortion = basisBeforeWithdrawal;
                    taxablePortion = 0.0;
                }
                currentBasis = Math.max(0.0, basisBeforeWithdrawal - excludablePortion);
                
            } else if (state === "PA") {
                // Pennsylvania Cost Recovery Model (FIFO)
                // Note: Qualified distributions after 59.5 are 100% tax-free. We assume non-qualified (early) 
                // uses cost recovery.
                // We'll calculate FIFO cost recovery: you recover your own contributions (basis) first.
                excludablePortion = Math.min(basisBeforeWithdrawal, totalWithdrawn);
                excludablePortion = Math.round(excludablePortion * 100) / 100;
                taxablePortion = Math.max(0.0, totalWithdrawn - excludablePortion);
                currentBasis = Math.max(0.0, basisBeforeWithdrawal - excludablePortion);
            }
        } else {
            currentBasis = basisBeforeWithdrawal;
        }

        history.push({
            year: yr,
            starting_basis: startingBasis,
            contributions: contribs,
            total_withdrawn: totalWithdrawn,
            dec_31_value: dec31Val,
            excludable_portion: excludablePortion,
            taxable_portion: taxablePortion,
            ending_basis: currentBasis
        });
    }

    return history;
}

// Render summary boxes, roll-forward table, and raw logs
function renderDashboard() {
    if (!activeAccount || !appData.accounts[activeAccount]) {
        // Clear views
        statTotalContribs.textContent = "$0.00";
        statUnrecoveredBasis.textContent = "$0.00";
        statRecoveredBasis.textContent = "$0.00";
        ledgerTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Select an account to view basis ledger.</td></tr>';
        transactionsTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No raw transactions logged.</td></tr>';
        return;
    }

    const account = appData.accounts[activeAccount];
    const transactions = account.transactions || [];
    
    // Recalculate history based on selected State taxation engine
    const history = calculateRollForward(transactions, activeState);
    
    // Cache calculated history back to object (so export API gets the right state representation)
    account.history = history;

    // Render Stats Metrics
    const totalContributions = transactions
        .filter(t => t.type === "contribution")
        .reduce((sum, t) => sum + t.amount, 0.0);
        
    const totalRecovered = history.reduce((sum, h) => sum + h.excludable_portion, 0.0);
    const unrecoveredBasis = history.length > 0 ? history[history.length - 1].ending_basis : totalContributions;

    statTotalContribs.textContent = formatCurrency(totalContributions);
    statUnrecoveredBasis.textContent = formatCurrency(unrecoveredBasis);
    statRecoveredBasis.textContent = formatCurrency(totalRecovered);

    // Render Calculated Roll-Forward Table
    if (history.length > 0) {
        ledgerTableBody.innerHTML = "";
        history.forEach(h => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${h.year}</strong></td>
                <td>${formatCurrency(h.starting_basis)}</td>
                <td>${formatCurrency(h.contributions)}</td>
                <td>${formatCurrency(h.total_withdrawn)}</td>
                <td>${formatCurrency(h.dec_31_value)}</td>
                <td class="highlight-column">${formatCurrency(h.excludable_portion)}</td>
                <td>${formatCurrency(h.taxable_portion)}</td>
                <td><strong>${formatCurrency(h.ending_basis)}</strong></td>
            `;
            ledgerTableBody.appendChild(row);
        });
    } else {
        ledgerTableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No contributions or withdrawals logged yet.</td></tr>';
    }

    // Render Raw Transactions Table
    if (transactions.length > 0) {
        transactionsTableBody.innerHTML = "";
        transactions.forEach((tx, idx) => {
            const dec_31 = tx.type === "withdrawal" ? formatCurrency(tx.dec_31_value) : "N/A";
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><code>#${idx}</code></td>
                <td>${tx.year}</td>
                <td><span class="badge ${tx.type === 'contribution' ? 'info-badge' : 'warning-badge'}">${tx.type}</span></td>
                <td>${formatCurrency(tx.amount)}</td>
                <td>${dec_31}</td>
                <td class="text-muted">${tx.note || ""}</td>
                <td><button class="btn btn-danger-sm" onclick="deleteTransaction(${idx})">Delete</button></td>
            `;
            transactionsTableBody.appendChild(row);
        });
    } else {
        transactionsTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No transaction entries found.</td></tr>';
    }
}

// Utility Currency Formatter
function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(val);
}

// Drag & Drop / File Upload handlers
function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        processFile(e.target.files[0]);
    }
}

function processFile(file) {
    const reader = new FileReader();
    
    // Check if PDF
    if (file.type === "application/pdf") {
        dropzone.querySelector(".dropzone-text").textContent = `Selected: ${file.name}`;
        // Since digital PDFs can contain compressed streams, we read them as text first to catch 
        // raw uncompressed PDF text. If that fails, we can prompt the user to paste.
        reader.onload = function(evt) {
            const rawContent = evt.target.result;
            // Clean up PDF layout chars
            const textContent = rawContent.replace(/[\x00-\x08\x0b-\x1f\x7f-\xff]/g, " ");
            executeTriageParser(textContent, file.name);
        };
        reader.readAsBinaryString(file);
    } else {
        // Plain text file (TXT, CSV)
        dropzone.querySelector(".dropzone-text").textContent = `Selected: ${file.name}`;
        reader.onload = function(evt) {
            executeTriageParser(evt.target.result, file.name);
        };
        reader.readAsText(file);
    }
}

// Reconstruct/Triage Parser Engine using regex
function executeTriageParser(text, filename = "") {
    let resultHTML = "";
    let matchFound = false;
    
    // Normalization: clean up double spaces and line endings
    const cleanText = text.replace(/\s+/g, " ");

    // 1. Check if IRS Transcript (FICA wage proxy comparison)
    if (cleanText.toUpperCase().includes("WAGE AND INCOME TRANSCRIPT") || cleanText.toUpperCase().includes("MEDICARE WAGES")) {
        // Find wages and Medicare wages
        const box1_match = text.match(/(?:Wages,\s*tips,\s*other\s*compensation|Wages,\s*tips):\s*\$?([0-9,]+\.[0-9]{2})/i);
        const box5_match = text.match(/(?:Medicare\s*wages\s*and\s*tips|Medicare\s*wages):\s*\$?([0-9,]+\.[0-9]{2})/i);
        const year_match = text.match(/(?:Tax\s*Year):\s*([0-9]{4})/i);

        if (box1_match && box5_match) {
            const box1 = parseFloat(box1_match[1].replace(/,/g, ""));
            const box5 = parseFloat(box5_match[1].replace(/,/g, ""));
            const year = year_match ? parseInt(year_match[1]) : new Date().getFullYear();
            
            const diff = box5 - box1;
            if (diff > 0) {
                matchFound = true;
                resultHTML = `
                    <p><strong>Detected Document:</strong> IRS Wage and Income Transcript</p>
                    <p><strong>Tax Year:</strong> ${year}</p>
                    <p><strong>Federal Taxable Wages (Box 1):</strong> ${formatCurrency(box1)}</p>
                    <p><strong>Medicare Wages (Box 5):</strong> ${formatCurrency(box5)}</p>
                    <p class="text-indigo"><strong>Derived State Basis Contribution:</strong> ${formatCurrency(diff)}</p>
                `;
                
                // Populate forms
                txType.value = "contribution";
                txYear.value = year;
                txAmount.value = diff.toFixed(2);
                txNote.value = `IRS Transcript (Box 5 - Box 1) for ${year}`;
                dec31Group.classList.add("hidden");
                txDec31.value = "";
            }
        }
    }
    
    // 2. Check if Form W-2 (Wages comparison)
    if (!matchFound && (cleanText.toUpperCase().includes("W-2 WAGE AND TAX") || cleanText.includes("Box 1") || cleanText.includes("Box 16"))) {
        const box1_match = text.match(/(?:Box\s*1|Wages,\s*tips,\s*other):\s*\$?([0-9,]+\.[0-9]{2})/i) || text.match(/(?:1\s*Wages,\s*tips):\s*\$?([0-9,]+\.[0-9]{2})/i);
        const box16_match = text.match(/(?:Box\s*16|State\s*wages):\s*\$?([0-9,]+\.[0-9]{2})/i) || text.match(/(?:16\s*State\s*wages):\s*\$?([0-9,]+\.[0-9]{2})/i);
        const year_match = text.match(/\b(20[0-9]{2})\b/); // Matches first 20XX year in text

        if (box1_match && box16_match) {
            const box1 = parseFloat(box1_match[1].replace(/,/g, ""));
            const box16 = parseFloat(box16_match[1].replace(/,/g, ""));
            const year = year_match ? parseInt(year_match[1]) : new Date().getFullYear();
            
            const diff = box16 - box1;
            if (diff > 0) {
                matchFound = true;
                resultHTML = `
                    <p><strong>Detected Document:</strong> W-2 Wage Statement</p>
                    <p><strong>Tax Year:</strong> ${year}</p>
                    <p><strong>Federal Wages (Box 1):</strong> ${formatCurrency(box1)}</p>
                    <p><strong>State Wages (Box 16):</strong> ${formatCurrency(box16)}</p>
                    <p class="text-indigo"><strong>Derived State Basis Contribution:</strong> ${formatCurrency(diff)}</p>
                `;
                
                // Populate forms
                txType.value = "contribution";
                txYear.value = year;
                txAmount.value = diff.toFixed(2);
                txNote.value = `W-2 Box 16 - Box 1 for ${year}`;
                dec31Group.classList.add("hidden");
                txDec31.value = "";
            }
        }
    }
    
    // 3. Check if Form 5498 (Traditional IRA contribution)
    if (!matchFound && (cleanText.includes("5498") || cleanText.toUpperCase().includes("IRA CONTRIBUTION INFORMATION"))) {
        const box1_match = text.match(/(?:Box\s*1|Traditional\s*IRA\s*contributions):\s*\$?([0-9,]+\.[0-9]{2})/i) || text.match(/(?:1\s*Traditional\s*IRA):\s*\$?([0-9,]+\.[0-9]{2})/i);
        const year_match = text.match(/\b(20[0-9]{2})\b/);

        if (box1_match) {
            const amount = parseFloat(box1_match[1].replace(/,/g, ""));
            const year = year_match ? parseInt(year_match[1]) : new Date().getFullYear();
            
            matchFound = true;
            resultHTML = `
                <p><strong>Detected Document:</strong> Form 5498 (IRA Contributions)</p>
                <p><strong>Tax Year:</strong> ${year}</p>
                <p class="text-indigo"><strong>Traditional IRA Contribution (Box 1):</strong> ${formatCurrency(amount)}</p>
            `;
            
            // Populate forms
            txType.value = "contribution";
            txYear.value = year;
            txAmount.value = amount.toFixed(2);
            txNote.value = `Form 5498 Box 1 for ${year}`;
            dec31Group.classList.add("hidden");
            txDec31.value = "";
        }
    }

    // 4. Check if Form 1099-R (Distributions)
    if (!matchFound && (cleanText.includes("1099-R") || cleanText.toUpperCase().includes("DISTRIBUTIONS FROM PENSIONS"))) {
        const box1_match = text.match(/(?:Box\s*1|Gross\s*distribution):\s*\$?([0-9,]+\.[0-9]{2})/i) || text.match(/(?:1\s*Gross\s*distribution):\s*\$?([0-9,]+\.[0-9]{2})/i);
        const box2_match = text.match(/(?:Box\s*2a|Taxable\s*amount):\s*\$?([0-9,]+\.[0-9]{2})/i) || text.match(/(?:2a\s*Taxable\s*amount):\s*\$?([0-9,]+\.[0-9]{2})/i);
        const year_match = text.match(/\b(20[0-9]{2})\b/);

        if (box1_match) {
            const amount = parseFloat(box1_match[1].replace(/,/g, ""));
            const taxable = box2_match ? parseFloat(box2_match[1].replace(/,/g, "")) : 0.00;
            const year = year_match ? parseInt(year_match[1]) : new Date().getFullYear();
            
            matchFound = true;
            resultHTML = `
                <p><strong>Detected Document:</strong> Form 1099-R (Withdrawal)</p>
                <p><strong>Tax Year:</strong> ${year}</p>
                <p class="text-indigo"><strong>Gross Distribution (Box 1):</strong> ${formatCurrency(amount)}</p>
                <p><strong>Federal Taxable Amount (Box 2a):</strong> ${formatCurrency(taxable)}</p>
            `;
            
            // Populate forms
            txType.value = "withdrawal";
            txYear.value = year;
            txAmount.value = amount.toFixed(2);
            txNote.value = `Form 1099-R Box 1 for ${year}`;
            dec31Group.classList.remove("hidden");
            txDec31.setAttribute("required", "true");
        }
    }

    // Display result panel
    if (matchFound) {
        parserResult.innerHTML = resultHTML + `<p class="help-text">Form populated. Please verify the amount and click 'Add Transaction Record' to log it.</p>`;
        parserResult.classList.remove("hidden");
    } else {
        parserResult.innerHTML = `
            <p style="color: var(--danger);"><strong>Triage Failure:</strong> Could not auto-detect fields from the document text.</p>
            <p class="help-text">Try copy-pasting the text block of the form directly, or verify that FICA/wages fields are clearly legible in the pasted text.</p>
        `;
        parserResult.classList.remove("hidden");
    }
}
