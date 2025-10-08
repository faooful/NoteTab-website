const notepad = document.getElementById("notepad");

// Add this at the top of your file with other global variables
let activeContextMenu = null;

// Add this constant at the top with other global variables
const STORAGE_KEYS = {
    CARDS: 'cardsArray',
    TEXT_AREA: 'textAreaContent',
    VIEW_STATE: 'viewState',
    THEME: 'theme'
};

// Add these variables at the top of your file
let mergeMode = false;
let mergeSource = null;

// Display saved notes on page load and initialize cardsArray
chrome.storage.local.get(['cardsArray'], function(result) {
    cardsArray = result.cardsArray || [];
    renderCards();
});

function adjustHeight() {
  if (this.scrollHeight > this.clientHeight) {
      this.style.height = (this.scrollHeight) + 'px';
  }
}

// Keep only the necessary event listener for keyboard shortcuts
document.addEventListener("keydown", function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
        document.getElementById('full-text-entry').focus();
    }
});

// Update the click event listener for delete buttons
document.addEventListener("click", function(e) {
    if (e.target && e.target.className == "deleteBtn") {
        const card = e.target.closest('.card');
        const cardContent = card.querySelector('.card-content').textContent.trim();
        const cardType = Array.from(card.classList).find(c => ['question', 'quote', 'insight', 'action'].includes(c));
        
        // Remove the card
        card.remove();
        
        // Remove the corresponding text from the textarea
        const textArea = document.getElementById('full-text-entry');
        const lines = textArea.value.split('\n');
        const lineIndex = findCardLine(textArea.value, cardContent, cardType);
        
        if (lineIndex !== -1) {
            lines.splice(lineIndex, 1);
            textArea.value = lines.join('\n');
            saveTextAreaContent(textArea.value);
        }
    }
});

// Update the color constants to just three options
const CARD_COLORS = [
    '#FFFFFF', // white (default)
    '#E2FFE2', // light green
    '#FFE2E2', // light pink
];

// Update createCard function to remove participant info
function createCard(text, timestamp, x, y, color = CARD_COLORS[0]) {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("draggable", "false");
    card.style.backgroundColor = color;
    
    // Create delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = "❌";
    deleteBtn.className = "deleteBtn";
    
    // Create the content structure
    const timeElement = document.createElement("small");
    timeElement.textContent = timestamp;
    
    const contentDiv = document.createElement("div");
    contentDiv.className = "card-content";
    contentDiv.innerHTML = `<p>${text}</p>`;
    
    // Add double-click to edit functionality
    contentDiv.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startEditing();
    });
    
    function startEditing() {
        const textarea = document.createElement('textarea');
        textarea.value = contentDiv.textContent;
        textarea.className = 'edit-textarea';
        
        // Make the textarea larger and comfortable to edit
        textarea.style.width = '95%';
        textarea.style.minHeight = '150px';
        
        // Replace content with textarea
        const originalContent = contentDiv.innerHTML;
        contentDiv.innerHTML = '';
        contentDiv.appendChild(textarea);
        
        // Disable card dragging while editing
        card.style.cursor = 'text';
        card.onmousedown = null;
        
        // Focus and select all text
        textarea.focus();
        textarea.select();
        
        function finishEditing() {
            const newText = textarea.value.trim();
            if (newText) {
                contentDiv.innerHTML = `<p>${newText}</p>`;
                updateLocalStorage();
            } else {
                contentDiv.innerHTML = originalContent;
            }
            card.style.cursor = 'move';
            makeDraggable(card);
        }
        
        // Handle saving on blur or Enter
        textarea.addEventListener('blur', finishEditing);
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                finishEditing();
            }
            if (e.key === 'Escape') {
                contentDiv.innerHTML = originalContent;
                card.style.cursor = 'move';
                makeDraggable(card);
            }
        });
    }

    // Set initial position
    card.style.left = x ? x + 'px' : '20px';
    card.style.top = y ? y + 'px' : '20px';
    
    // Append elements to the card
    card.appendChild(timeElement);
    card.appendChild(contentDiv);
    card.appendChild(deleteBtn);
    notepad.appendChild(card);

    // Add drag functionality with merging
    makeDraggable(card);
}

// Restore merging functionality in makeDraggable
function makeDraggable(card) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let mergeTarget = null;
    let mergeTimeout = null;
    
    card.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (e.target.classList.contains('deleteBtn') || 
            e.target.classList.contains('edit-textarea')) {
            return;
        }

        // Don't start drag if it's just a click
        const startX = e.clientX;
        const startY = e.clientY;
        
        const onMouseMove = (moveEvent) => {
            const deltaX = Math.abs(moveEvent.clientX - startX);
            const deltaY = Math.abs(moveEvent.clientY - startY);
            
            // Only start drag if mouse has moved more than 5 pixels
            if (deltaX > 5 || deltaY > 5) {
                e.preventDefault();
                clearMergeStates();
                
                pos3 = moveEvent.clientX;
                pos4 = moveEvent.clientY;
                document.onmousemove = elementDrag;
                document.onmouseup = closeDragElement;
                
                // Remove the mousemove listener since we're now dragging
                document.removeEventListener('mousemove', onMouseMove);
            }
        };
        
        // Add temporary mousemove listener to check for drag
        document.addEventListener('mousemove', onMouseMove);
        
        // Remove listener if mouse is released without dragging
        document.addEventListener('mouseup', () => {
            document.removeEventListener('mousemove', onMouseMove);
        }, { once: true });
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Update position
        card.style.top = (card.offsetTop - pos2) + "px";
        card.style.left = (card.offsetLeft - pos1) + "px";
        
        // Check for merge target
        const target = checkForMergeTarget(card);
        if (target !== mergeTarget) {
            clearMergeStates();
            if (target) {
                startMergeAnimation(card, target);
            }
            mergeTarget = target;
        }
    }

    function closeDragElement() {
        document.onmousemove = null;
        document.onmouseup = null;
        
        if (mergeTarget && mergeTarget.classList.contains('merge-ready')) {
            mergeCards(card, mergeTarget);
        }
        
        clearMergeStates();
        updateLocalStorage();
    }

    function clearMergeStates() {
        if (mergeTimeout) {
            clearTimeout(mergeTimeout);
            mergeTimeout = null;
        }
        document.querySelectorAll('.card').forEach(c => {
            c.classList.remove('merge-animation', 'merge-ready');
        });
        mergeTarget = null;
    }
}

// Restore helper functions for merging
function checkForMergeTarget(draggedCard) {
    const cards = document.querySelectorAll('.card');
    const draggedRect = draggedCard.getBoundingClientRect();
    
    for (const card of cards) {
        if (card === draggedCard) continue;
        
        const cardRect = card.getBoundingClientRect();
        if (isOverlapping(draggedRect, cardRect)) {
            return card;
        }
    }
    return null;
}

function isOverlapping(rect1, rect2) {
    return !(rect1.right < rect2.left || 
            rect1.left > rect2.right || 
            rect1.bottom < rect2.top || 
            rect1.top > rect2.bottom);
}

function startMergeAnimation(card1, card2) {
    card1.classList.add('merge-animation');
    card2.classList.add('merge-animation');
    
    mergeTimeout = setTimeout(() => {
        card1.classList.add('merge-ready');
        card2.classList.add('merge-ready');
    }, 1000);
}

function mergeCards(card1, card2) {
    const text1 = card1.querySelector('.card-content').textContent;
    const text2 = card2.querySelector('.card-content').textContent;
    const mergedText = `${text1}\n\n${text2}`;
    
    // Use position of the newer card
    const time1 = new Date(card1.querySelector('small').textContent);
    const time2 = new Date(card2.querySelector('small').textContent);
    const newerCard = time1 > time2 ? card1 : card2;
    const x = newerCard.style.left;
    const y = newerCard.style.top;
    
    // Remove both cards
    card1.remove();
    card2.remove();
    
    // Create new merged card
    createCard(mergedText, new Date().toLocaleString(), parseInt(x), parseInt(y));
    updateLocalStorage();
}

function renderCards() {
    const notepad = document.getElementById('notepad');
    if (!notepad) {
        console.error('Notepad element not found');
        return;
    }
    
    notepad.innerHTML = ''; // Clear existing cards
    
    // Sort cards by order before rendering
    const sortedCards = [...cardsArray].sort((a, b) => a.order - b.order);
    
    sortedCards.forEach(cardData => {
        createCardWithTag(cardData.type, cardData.text, cardData.order);
    });
}

// Update updateLocalStorage function to include order
function updateLocalStorage() {
    const textArea = document.getElementById('full-text-entry');
    saveTextAreaContent(textArea.value);
}

// Add this function to your main.js
async function saveToFile() {
    try {
        // Request permission to access file system
        const handle = await window.showSaveFilePicker({
            suggestedName: 'my-notes.txt',
            types: [{
                description: 'Text Files',
                accept: {
                    'text/plain': ['.txt'],
                },
            }],
        });
        
        // Create a FileSystemWritableFileStream
        const writable = await handle.createWritable();
        
        // Write the notes
        const notes = JSON.stringify(cardsArray);
        await writable.write(notes);
        await writable.close();
    } catch (err) {
        console.error('Failed to save file:', err);
    }
}

// Add this function to load from a file
async function loadFromFile() {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{
                description: 'Text Files',
                accept: {
                    'text/plain': ['.txt'],
                },
            }],
        });
        
        const file = await handle.getFile();
        const contents = await file.text();
        cardsArray = JSON.parse(contents);
        renderCards();
    } catch (err) {
        console.error('Failed to load file:', err);
    }
}

// Add these functions to your main.js
function downloadNotes() {
    const notes = cardsArray.map(note => {
        return `Date: ${note.time}\n${note.text}\n-------------------\n`;
    }).join('\n');
    
    const blob = new Blob([notes], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${new Date().toLocaleDateString()}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function uploadNotes(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
        cardsArray = JSON.parse(e.target.result);
        renderCards();
        chrome.storage.local.set({ cardsArray: cardsArray });
    };
    reader.readAsText(file);
}

// Add a search bar to quickly find notes
function addSearchBar() {
    const searchContainer = document.createElement('div');
    searchContainer.innerHTML = `
        <input type="text" id="searchNotes" placeholder="🔍 Search notes...">
        <select id="filterColor">
            <option value="all">All Colors</option>
            <option value="#FFFFFF">White</option>
            <option value="#E2FFE2">Green</option>
            <option value="#FFE2E2">Pink</option>
        </select>
    `;
    document.getElementById('entry-box-container').appendChild(searchContainer);
}

// Add ability to tag notes with #hashtags
function enableHashtags(text) {
    const hashtagRegex = /#[a-zA-Z0-9]+/g;
    const tags = text.match(hashtagRegex) || [];
    return {
        text: text,
        tags: tags
    };
}

// Update the context menu function
function addContextMenu(card) {
    card.addEventListener('contextmenu', (e) => {
        // Don't show context menu if clicking on interactive elements
        if (e.target.tagName === 'TEXTAREA' || 
            e.target.tagName === 'BUTTON' || 
            e.target.classList.contains('action-button') ||
            e.target.classList.contains('edit-textarea')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        
        // Remove any existing context menu
        if (activeContextMenu) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <div class="menu-item">Pin to Top</div>
            <div class="menu-item">Share Note</div>
            <div class="menu-item">Copy Text</div>
            <div class="menu-item">Archive</div>
        `;

        // Position menu at cursor but ensure it stays within viewport
        const x = Math.min(e.pageX, window.innerWidth - 160);
        const y = Math.min(e.pageY, window.innerHeight - 200);
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        
        activeContextMenu = menu;
        document.body.appendChild(menu);

        // Add click handlers to menu items
        menu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                handleMenuAction(item.textContent, card);
                closeContextMenu();
            });
        });

        // Close menu when clicking outside
    setTimeout(() => {
            document.addEventListener('click', closeContextMenu);
            document.addEventListener('contextmenu', closeContextMenu);
    }, 0);
});
}

// Update the closeContextMenu function to be more thorough
function closeContextMenu(e) {
    if (activeContextMenu) {
        if (!e || !e.target.closest('.context-menu')) {
            activeContextMenu.remove();
            activeContextMenu = null;
            document.removeEventListener('click', closeContextMenu);
            document.removeEventListener('contextmenu', closeContextMenu);
        }
    }
}

function handleMenuAction(action, card) {
    switch(action) {
        case 'Pin to Top':
            card.style.zIndex = '1000';
            break;
        case 'Share Note':
            const text = card.querySelector('.card-content').textContent;
            navigator.clipboard.writeText(text);
            break;
        case 'Copy Text':
            const content = card.querySelector('.card-content').textContent;
            navigator.clipboard.writeText(content);
            break;
        case 'Archive':
            card.style.opacity = '0.5';
            break;
    }
    updateLocalStorage();
}

const TEMPLATES = {
    todo: "## To-Do List\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3",
    meeting: "## Meeting Notes\nDate: {date}\nAttendees:\n\nAgenda:\n1.\n2.\n3.",
    idea: "## Idea\nDescription:\n\nNext Steps:\n1.\n2.\n3."
};

function addTemplateButton() {
    const templateBtn = document.createElement('button');
    templateBtn.innerHTML = '📋';
    templateBtn.className = 'template-btn';
    templateBtn.onclick = showTemplateMenu;
    document.getElementById('entry-box-container').appendChild(templateBtn);
}

function arrangeCards(pattern = 'grid') {
    const cards = document.querySelectorAll('.card');
    const padding = 20;
    
    if (pattern === 'grid') {
        let row = 0, col = 0;
        cards.forEach(card => {
            card.style.left = (col * 220 + padding) + 'px';
            card.style.top = (row * 120 + 120) + 'px';
            col++;
            if (col * 220 > window.innerWidth - 220) {
                col = 0;
                row++;
            }
        });
    }
}

function enableMarkdownPreview(textarea, previewDiv) {
    textarea.addEventListener('input', () => {
        const markdown = textarea.value;
        previewDiv.innerHTML = marked(markdown); // Using marked.js
    });
}

function addReminder(card) {
    const reminderBtn = document.createElement('button');
    reminderBtn.innerHTML = '⏰';
    reminderBtn.onclick = () => {
        const time = prompt('Set reminder (minutes):');
        if (time) {
    setTimeout(() => {
                card.style.animation = 'shake 0.5s';
                new Notification('Note Reminder', {
                    body: card.querySelector('.card-content').textContent
                });
            }, time * 60000);
        }
    };
    card.appendChild(reminderBtn);
}

function exportAsFormat(format) {
    switch(format) {
        case 'markdown':
            return cardsArray.map(card => 
                `# Note ${card.time}\n${card.text}`
            ).join('\n\n---\n\n');
        case 'html':
            return `<html><body>${cardsArray.map(card =>
                `<div class="note">${card.text}</div>`
            ).join('')}</body></html>`;
    }
}

function enableSharing(card) {
    const shareBtn = document.createElement('button');
    shareBtn.innerHTML = '📤';
    shareBtn.onclick = async () => {
        const noteText = card.querySelector('.card-content').textContent;
        await navigator.clipboard.writeText(noteText);
        // Could also implement actual sharing via API
    };
    card.appendChild(shareBtn);
}

// Add these interview-specific templates
const INTERVIEW_TEMPLATES = {
    userInterview: `## User Interview Notes
Participant: [Name]
Role: [Role]
Date: ${new Date().toLocaleDateString()}

### Key Questions:
1. 
2. 
3. 

### Pain Points:
- 

### Quotes:
> 

### Observations:
- 

### Action Items:
- `,

    usabilityTest: `## Usability Test
Participant: [Name]
Task: [Task Description]
Date: ${new Date().toLocaleDateString()}

### Task Completion:
□ Completed
□ Partially Completed
□ Not Completed

### Observations:
- 

### User Quotes:
> 

### Pain Points:
- 

### Suggestions:
- `,

    synthesis: `## Interview Synthesis
Date: ${new Date().toLocaleDateString()}

### Common Patterns:
- 

### Key Insights:
- 

### Recommendations:
- 

### Next Steps:
- `
};

function enablePatternLinking() {
    let selectedCards = new Set();
    
    function toggleCardSelection(card) {
        if (selectedCards.has(card)) {
            selectedCards.delete(card);
            card.style.border = '2px solid #e0e0e0';
        } else {
            selectedCards.add(card);
            card.style.border = '2px solid #4CAF50';
        }
    }
    
    function createPattern() {
        if (selectedCards.size < 2) return;
        
        const patternCard = createCard(
            '## Pattern Identified\n\nRelated Notes:\n' + 
            Array.from(selectedCards)
                .map(card => '- ' + card.querySelector('.card-content').textContent)
                .join('\n'),
            new Date().toLocaleString(),
            50,
            50,
            '#FFF9C4'
        );
        
        selectedCards.clear();
    }
}

function addTemplateSelector() {
    const templateSelect = document.createElement('select');
    templateSelect.className = 'template-select';
    templateSelect.innerHTML = `
        <option value="">Select Template...</option>
        <option value="userInterview">User Interview</option>
        <option value="usabilityTest">Usability Test</option>
        <option value="synthesis">Interview Synthesis</option>
    `;
    
    templateSelect.onchange = () => {
        if (templateSelect.value) {
            const template = INTERVIEW_TEMPLATES[templateSelect.value];
            createCard(template, new Date().toLocaleString(), 50, 50);
            templateSelect.value = '';
        }
    };
    
    document.getElementById('entry-box-container').appendChild(templateSelect);
}

// Update the setupInterviewPanel function to remove timer and date
function setupInterviewPanel() {
    const mainContainer = document.createElement('div');
    mainContainer.id = 'main-container';
    
    // Create left panel
    const leftPanel = document.createElement('div');
    leftPanel.id = 'left-panel';
    
    // Add header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'interview-header';
    headerDiv.innerHTML = `<h2>Interview Notes</h2>`;
    
    // Add notes section
    const textArea = document.createElement('textarea');
    textArea.id = 'full-text-entry';
    textArea.placeholder = `Type your notes here...

Special markers:
Q: Question
> Quote
! Insight
* Action Item`;
    
    // Assemble panel
    leftPanel.appendChild(headerDiv);
    leftPanel.appendChild(textArea);
    
    // Add toggle button
    const toggleButton = document.createElement('button');
    toggleButton.id = 'toggle-panel';
    toggleButton.innerHTML = '◀';
    toggleButton.onclick = toggleLeftPanel;
    
    // Move existing notepad
    const notepad = document.getElementById('notepad');
    notepad.className = 'right-panel';
    
    // Restructure DOM
    document.body.insertBefore(mainContainer, document.body.firstChild);
    mainContainer.appendChild(leftPanel);
    mainContainer.appendChild(toggleButton);
    mainContainer.appendChild(notepad);
    
    // Initialize auto-parsing
    initializeAutoParsing(textArea);
}

// Update the initializeAutoParsing function
function initializeAutoParsing(textArea) {
    textArea.addEventListener('input', (e) => {
        // Parse all text and update cards whenever the text changes
        parseNotes(textArea.value);
        
        // Save text area content
        saveTextAreaContent(textArea.value);
    });
}

// Add new function to save text area content
function saveTextAreaContent(content) {
    chrome.storage.local.set({ 
        [STORAGE_KEYS.TEXT_AREA]: content 
    }, function() {
        if (chrome.runtime.lastError) {
            console.error('Error saving text area:', chrome.runtime.lastError);
        }
    });
}

// Update findCardLine to be more precise in matching
function findCardLine(text, cardContent, cardType) {
    const lines = text.split('\n');
    const markers = {
        'question': 'Q:',
        'quote': '>',
        'insight': '!',
        'action': '*'
    };
    
    const marker = markers[cardType];
    const cleanCardContent = cardContent.trim();
    
    return lines.findIndex(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith(marker)) {
            const lineContent = trimmedLine.substring(marker.length).trim();
            return lineContent === cleanCardContent;
        }
        return false;
    });
}

// Update parseNotes to handle empty state
function parseNotes(text) {
    const lines = text.split('\n');
    const notepad = document.getElementById('notepad');
    const textArea = document.getElementById('full-text-entry');
    const viewToggle = document.querySelector('.view-toggle');
    
    // Clear all existing cards
    notepad.innerHTML = '';
    
    let hasCards = false;
    
    // Create cards for each valid line
    lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            let type = null;
            let content = null;
            
            if (trimmedLine.startsWith('Q:')) {
                type = 'question';
                content = trimmedLine.substring(2).trim();
            } else if (trimmedLine.startsWith('>')) {
                type = 'quote';
                content = trimmedLine.substring(1).trim();
            } else if (trimmedLine.startsWith('!')) {
                type = 'insight';
                content = trimmedLine.substring(1).trim();
            } else if (trimmedLine.startsWith('*')) {
                type = 'action';
                content = trimmedLine.substring(1).trim();
            }
            
            if (type && content) {
                createCardWithTag(type, content);
                hasCards = true;
            }
        }
    });

    // If no cards were created, switch to text view
    if (!hasCards) {
        notepad.classList.remove('active');
        textArea.style.display = 'block';
        if (viewToggle) {
            viewToggle.textContent = 'Show Cards';
        }
        saveViewState(false);
    }
}

let draggedCard = null;
let dropTarget = null;

function createCardWithTag(type, content) {
    const notepad = document.getElementById('notepad');
    if (!notepad) {
        console.error('Notepad element not found');
        return;
    }

    const tagIcons = {
        'question': 'Question',
        'quote': 'Quote',
        'insight': 'Insight',
        'action': 'Action'
    };
    
    const card = document.createElement("div");
    card.className = `card ${type}`;
    
    // Create delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = "❌";
    deleteBtn.className = "deleteBtn";
    
    // Add click handler
    card.addEventListener('click', (e) => {
        // Don't trigger on delete button
        if (!e.target.classList.contains('deleteBtn')) {
            // Remove active state from all cards and dim them
            document.querySelectorAll('.card').forEach(c => {
                c.classList.add('dimmed');
                c.classList.remove('active');
            });
            
            // Make clicked card active and undimmed
            card.classList.remove('dimmed');
            card.classList.add('active');
            
            highlightTextInTextArea(content, type);
        }
    });
    
    const contentDiv = document.createElement("div");
    contentDiv.className = "card-content";
    contentDiv.innerHTML = `<p>${content}</p>`;
    
    const tagElement = document.createElement("div");
    tagElement.className = 'card-tag';
    tagElement.innerHTML = tagIcons[type];
    
    // Change the order: first delete button, then content, then tag
    card.appendChild(deleteBtn);
    card.appendChild(contentDiv);
    card.appendChild(tagElement);
    
    notepad.appendChild(card);
    
    updateLocalStorage();
}

// Update the toggleLeftPanel function to handle notepad width
function toggleLeftPanel() {
    const leftPanel = document.getElementById('left-panel');
    const toggleButton = document.getElementById('toggle-panel');
    const mainContainer = document.getElementById('main-container');
    const notepad = document.getElementById('notepad');
    
    if (leftPanel.classList.contains('collapsed')) {
        leftPanel.classList.remove('collapsed');
        toggleButton.innerHTML = '◀';
        mainContainer.classList.remove('panel-collapsed');
        notepad.style.width = 'calc(100vw - 420px)'; // Account for left panel and margin
    } else {
        leftPanel.classList.add('collapsed');
        toggleButton.innerHTML = '▶';
        mainContainer.classList.add('panel-collapsed');
        notepad.style.width = 'calc(100vw - 20px)'; // Almost full width when panel is collapsed
    }
}

// Update the DOMContentLoaded event listener
document.addEventListener("DOMContentLoaded", function() {
    const notepad = document.getElementById('notepad');
    const textArea = document.getElementById('full-text-entry');
    
    if (!notepad || !textArea) {
        console.error('Required elements not found');
        return;
    }

    // Initialize auto-parsing
    initializeAutoParsing(textArea);
    
    // Load saved content and only use text area content to generate cards
    chrome.storage.local.get([STORAGE_KEYS.TEXT_AREA], function(result) {
        if (result[STORAGE_KEYS.TEXT_AREA]) {
            textArea.value = result[STORAGE_KEYS.TEXT_AREA];
            // Parse the loaded text to create cards
            parseNotes(result[STORAGE_KEYS.TEXT_AREA]);
        }
    });

    const exportButton = document.querySelector('.export-button');
    const exportOptions = document.querySelector('.export-options');

    // Toggle menu on button click
    exportButton.addEventListener('click', (e) => {
        e.stopPropagation();
        exportOptions.classList.toggle('show');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.export-dropdown')) {
            exportOptions.classList.remove('show');
        }
    });

    // Prevent menu from closing when clicking inside it
    exportOptions.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Add export button listeners
    document.querySelectorAll('.export-option').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            exportOptions.classList.remove('show'); // Hide menu after selection
            switch (action) {
                case 'clipboard':
                    copyToClipboard();
                    break;
                case 'text':
                    exportToPlainText();
                    break;
            }
        });
    });

    // Add view toggle functionality
    const viewToggle = document.querySelector('.view-toggle');
    
    // First load the saved view state
    chrome.storage.local.get([STORAGE_KEYS.VIEW_STATE], function(result) {
        const savedViewState = result[STORAGE_KEYS.VIEW_STATE];
        
        if (savedViewState) {
            // If there are no cards, don't switch to card view regardless of saved state
            if (notepad.children.length === 0 && savedViewState) {
                saveViewState(false);
                return;
            }
            
            // Apply the saved view state
            notepad.classList.toggle('active', savedViewState);
            textArea.style.display = savedViewState ? 'none' : 'block';
            viewToggle.textContent = savedViewState ? 'Show Text' : 'Show Cards';
        }
    });

    viewToggle.addEventListener('click', () => {
        const isCardView = !notepad.classList.contains('active');
        
        // If switching to card view but there are no cards, don't switch
        if (isCardView && notepad.children.length === 0) {
            return;
        }
        
        // Toggle the views
        notepad.classList.toggle('active');
        textArea.style.display = isCardView ? 'none' : 'block';
        viewToggle.textContent = isCardView ? 'Show Text' : 'Show Cards';
        
        // Save the new view state
        saveViewState(isCardView);
    });

    // Add sort button functionality
    const sortButtons = document.querySelectorAll('.sort-button');
    sortButtons.forEach(button => {
        button.addEventListener('click', () => {
            const sortType = button.dataset.sort;
            if (sortType) {
                // Make sure we're in card view before sorting
                const notepad = document.getElementById('notepad');
                if (!notepad.classList.contains('active')) {
                    notepad.classList.add('active');
                    document.getElementById('full-text-entry').style.display = 'none';
                    document.querySelector('.view-toggle').textContent = 'Show Text';
                }
                sortCards(sortType);
            }
        });
    });

    // Load saved theme
    chrome.storage.local.get([STORAGE_KEYS.THEME], function(result) {
        const savedTheme = result[STORAGE_KEYS.THEME] || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeButton(savedTheme);
    });

    // Add this to the DOMContentLoaded event listener, after loading the saved theme
    document.querySelector('.theme-toggle').addEventListener('click', toggleTheme);
});

// Update the text area creation in your DOMContentLoaded event
function createSyntaxHelper() {
    const syntaxHelper = document.createElement('div');
    syntaxHelper.className = 'syntax-helper';
    syntaxHelper.innerHTML = `
        <div class="syntax-item question">
            <code>Q:</code> <span>Question</span>
        </div>
        <div class="syntax-item quote">
            <code>></code> <span>Quote</span>
        </div>
        <div class="syntax-item insight">
            <code>!</code> <span>Insight</span>
        </div>
        <div class="syntax-item action">
            <code>*</code> <span>Action</span>
        </div>
    `;
    return syntaxHelper;
}

// Add this function to handle merge mode toggle
function toggleMergeMode(card) {
    if (!mergeMode) {
        // Enter merge mode
        mergeMode = true;
        mergeSource = card;
        card.classList.add('merge-ready');
        
        // Add merge indicators to nearby cards
        const cards = document.querySelectorAll('.card');
        cards.forEach(targetCard => {
            if (targetCard !== card) {
                targetCard.classList.add('merge-animation');
            }
        });
    } else {
        // Exit merge mode
        cleanupMergeMode();
    }
}

// Add cleanup function
function cleanupMergeMode() {
    mergeMode = false;
    if (mergeSource) {
        mergeSource.classList.remove('merge-ready');
    }
    document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('merge-animation', 'merge-ready', 'merging-target', 'merge-highlight');
        card.classList.remove('merge-left', 'merge-right', 'merge-top', 'merge-bottom');
    });
    mergeSource = null;
}

// Add escape key handler to exit merge mode
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mergeMode) {
        cleanupMergeMode();
    }
});

// Update the sortCards function with simpler animation
function sortCards(sortType) {
    const notepad = document.getElementById('notepad');
    const cards = Array.from(notepad.querySelectorAll('.card'));
    const textArea = document.getElementById('full-text-entry');
    
    if (cards.length === 0) return; // Don't sort if there are no cards
    
    // Sort the cards array based on the selected sort type
    if (sortType === 'text-order') {
        // Get all lines from text area that start with markers
        const lines = textArea.value.split('\n');
        const markerLines = lines.map((line, index) => ({
            line: line.trim(),
            index: index
        })).filter(item => {
            return item.line.startsWith('Q:') || 
                   item.line.startsWith('>') || 
                   item.line.startsWith('!') || 
                   item.line.startsWith('*');
        });
        
        // Sort cards based on their order in the text
        cards.sort((a, b) => {
            const aContent = a.querySelector('.card-content').textContent.trim();
            const bContent = b.querySelector('.card-content').textContent.trim();
            
            const aIndex = markerLines.findIndex(item => 
                item.line.includes(aContent.substring(0, Math.min(aContent.length, 50)))
            );
            const bIndex = markerLines.findIndex(item => 
                item.line.includes(bContent.substring(0, Math.min(bContent.length, 50)))
            );
            
            return aIndex - bIndex;
        });
    } else if (sortType === 'tag') {
        // Define tag order
        const tagOrder = {
            'question': 1,
            'quote': 2,
            'insight': 3,
            'action': 4
        };
        
        // Sort cards by tag
        cards.sort((a, b) => {
            const aType = Array.from(a.classList).find(c => tagOrder[c]);
            const bType = Array.from(b.classList).find(c => tagOrder[c]);
            return tagOrder[aType] - tagOrder[bType];
        });
    }
    
    // Add sorting class to disable transitions temporarily
    cards.forEach(card => {
        card.classList.add('sorting');
        card.classList.remove('sorting-animated', 'sorting-complete');
    });
    
    // Force reflow
    notepad.offsetHeight;
    
    // Reappend cards in new order
    cards.forEach(card => {
        notepad.appendChild(card);
        // Add sorting-animated class after a brief delay to ensure transition works
        requestAnimationFrame(() => {
            card.classList.add('sorting-animated');
        });
    });
    
    // Add completion animation
    cards.forEach(card => {
        card.addEventListener('transitionend', function handler() {
            card.removeEventListener('transitionend', handler);
            card.classList.remove('sorting', 'sorting-animated');
            card.classList.add('sorting-complete');
            
            setTimeout(() => {
                card.classList.remove('sorting-complete');
            }, 300);
        }, { once: true });
    });
}

// Add this function to scroll to and highlight text in textarea
function highlightTextInTextArea(content, type) {
    const textArea = document.getElementById('full-text-entry');
    const markers = {
        'question': 'Q:',
        'quote': '>',
        'insight': '!',
        'action': '*'
    };
    
    const marker = markers[type];
    const lines = textArea.value.split('\n');
    const lineIndex = findCardLine(textArea.value, content, type);
    
    if (lineIndex !== -1) {
        // Calculate the position to scroll to
        const lineStart = lines.slice(0, lineIndex).join('\n').length + (lineIndex > 0 ? 1 : 0);
        const lineEnd = lineStart + lines[lineIndex].length;
        
        // Set selection range to highlight the text
        textArea.focus();
        textArea.setSelectionRange(lineStart, lineEnd);
        
        // Scroll the line into view
        const lineHeight = parseInt(getComputedStyle(textArea).lineHeight);
        const scrollPosition = lineHeight * lineIndex;
        textArea.scrollTop = scrollPosition - textArea.clientHeight / 2;
    }
}

// Add click handler to clear active state when clicking outside cards
document.addEventListener('click', (e) => {
    if (!e.target.closest('.card')) {
        document.querySelectorAll('.card').forEach(card => {
            card.classList.remove('dimmed', 'active');
        });
    }
});

// Add these export functions
function formatCardsForExport() {
    const cards = Array.from(document.querySelectorAll('.card'));
    return cards.map((card, index) => {
        const content = card.querySelector('.card-content').textContent.trim();
        const type = card.querySelector('.card-tag').textContent.trim();
        return `${index + 1}. ${content}\n   ${type}`;
    }).join('\n\n');
}

function copyToClipboard() {
    const formattedText = formatCardsForExport();
    navigator.clipboard.writeText(formattedText)
        .then(() => {
            // Show success message
            const button = document.querySelector('[data-action="clipboard"]');
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        })
        .catch(err => {
            console.error('Failed to copy:', err);
        });
}

function exportToPlainText() {
    const formattedText = formatCardsForExport();
    const blob = new Blob([formattedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Add this function to save the view state
function saveViewState(isCardView) {
    chrome.storage.local.set({ 
        [STORAGE_KEYS.VIEW_STATE]: isCardView 
    }, function() {
        if (chrome.runtime.lastError) {
            console.error('Error saving view state:', chrome.runtime.lastError);
        }
    });
}

// Add this function to handle theme switching
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    updateThemeButton(newTheme);
    saveTheme(newTheme);
}

// Update this function to handle theme button text
function updateThemeButton(theme) {
    const button = document.querySelector('.theme-toggle');
    if (button) {
        button.innerHTML = theme === 'dark' 
            ? '☀️ Light Mode' 
            : '🌙 Dark Mode';
    }
}

// Add this function to save the theme preference
function saveTheme(theme) {
    chrome.storage.local.set({ 
        [STORAGE_KEYS.THEME]: theme 
    }, function() {
        if (chrome.runtime.lastError) {
            console.error('Error saving theme:', chrome.runtime.lastError);
        }
    });
}
