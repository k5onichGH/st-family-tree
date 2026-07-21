import { getContext, extension_settings } from "../../../extensions.js";

const EXTENSION_NAME = "family_tree";
let treeData = { nodes: [], links: [] };
let activeNodeIdForLinks = null; // ID персонажа, чьи связи мы сейчас редактируем

async function loadHtml() {
    const response = await fetch('/scripts/extensions/family-tree/ui.html');
    if (response.ok) {
        const html = await response.text();
        $('body').append(html);
    }
}

async function init() {
    await loadHtml();
const treeIconHtml = `
    <div id="ft_top_menu_btn" class="menu_button" title="Семейное древо" style="display: flex; align-items: center; justify-content: center;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <!-- Квадрат сверху -->
            <rect x="9" y="3" width="6" height="4" rx="1"></rect>
            <!-- Линия вниз -->
            <path d="M12 7v4"></path>
            <!-- Горизонтальная линия -->
            <path d="M6 11h12"></path>
            <!-- Линии к нижним квадратам -->
            <path d="M6 11v4"></path>
            <path d="M18 11v4"></path>
            <!-- Нижние квадраты -->
            <rect x="3" y="15" width="6" height="4" rx="1"></rect>
            <rect x="15" y="15" width="6" height="4" rx="1"></rect>
        </svg>
    </div>
`;
$('#rm_button_group_chats').append(treeIconHtml);

    $('#ft_top_menu_btn').on('click', openFamilyTree);
    $('#ft_close').on('click', () => $.magnificPopup.close());
    $('#ft_add_character').on('click', addNewCharacter);
    
    // Кнопки внутри панели управления связями
    $('#ft_cp_close').on('click', () => $('#ft_connection_panel').hide());
    $('#ft_cp_add').on('click', createLink);

    const context = getContext();
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, loadTreeDataForCurrentChat);
}

function openFamilyTree() {
    $.magnificPopup.open({
        items: { src: '#family_tree_popup', type: 'inline' },
        callbacks: {
            open: function() {
                $('#ft_connection_panel').hide();
                renderTree();
            }
        }
    });
}

function generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
}

function addNewCharacter() {
    const newNode = {
        id: generateId(),
        x: Math.floor(Math.random() * 100) + 50, // Небольшой разброс координат
        y: Math.floor(Math.random() * 100) + 50,
        name: "Неизвестный",
        age: "",
        status: "alive",
        image: "img/ai4.png"
    };
    treeData.nodes.push(newNode);
    saveTreeData();
    renderTree();
}

function renderTree() {
    const workspace = $('#family_tree_workspace');
    workspace.find('.ft-card').remove();
    
    const template = document.getElementById('ft_card_template').content;

    treeData.nodes.forEach(nodeData => {
        const clone = document.importNode(template, true);
        const card = $(clone.querySelector('.ft-card'));
        
        card.attr('data-id', nodeData.id);
        card.css({ left: nodeData.x + 'px', top: nodeData.y + 'px' });
        
        card.find('.ft-input-name').val(nodeData.name);
        card.find('.ft-input-age').val(nodeData.age);
        card.find('.ft-input-status').val(nodeData.status);
        card.find('.ft-card-image').attr('src', nodeData.image);
        
        // Автосохранение при вводе текста
        card.find('input, select').on('change', function() {
            nodeData.name = card.find('.ft-input-name').val() || "Неизвестный";
            nodeData.age = card.find('.ft-input-age').val();
            nodeData.status = card.find('.ft-input-status').val();
            saveTreeData();
            
            // Если открыта панель связей, обновляем имя там
            if (activeNodeIdForLinks === nodeData.id) {
                $('#ft_cp_name').text(nodeData.name);
            }
        });

        // Смена картинки
        card.find('.ft-card-image-container').on('click', function() {
            const newUrl = prompt("Введите URL изображения (ссылку из интернета или локальную, например img/ai5.png):", nodeData.image);
            if (newUrl) {
                nodeData.image = newUrl;
                card.find('.ft-card-image').attr('src', newUrl);
                saveTreeData();
            }
        });

        // Открытие панели связей
        card.find('.ft-link-btn').on('click', function() {
            openConnectionPanel(nodeData);
        });

        // Удаление карточки
        card.find('.ft-delete-btn').on('click', function() {
            if(confirm("Точно удалить персонажа? Все его связи тоже удалятся.")) {
                // Удаляем узел
                treeData.nodes = treeData.nodes.filter(n => n.id !== nodeData.id);
                // Удаляем все связи, где этот узел был источником или целью
                treeData.links = treeData.links.filter(l => l.sourceId !== nodeData.id && l.targetId !== nodeData.id);
                
                $('#ft_connection_panel').hide();
                saveTreeData();
                renderTree();
            }
        });

        setupDragAndDrop(card[0], nodeData);
        workspace.append(card);
    });

    drawLines();
}

function setupDragAndDrop(element, nodeData) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    $(element).on('mousedown', function(e) {
        if ($(e.target).closest('input, select, button, .ft-card-image-container').length) return;
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseInt($(element).css('left'), 10) || 0;
        initialTop = parseInt($(element).css('top'), 10) || 0;
        $(element).css('z-index', 1000);
    });

    $(document).on('mousemove', function(e) {
        if (!isDragging) return;
        
        nodeData.x = initialLeft + (e.clientX - startX);
        nodeData.y = initialTop + (e.clientY - startY);
        
        $(element).css({ left: nodeData.x + 'px', top: nodeData.y + 'px' });
        drawLines(); 
    });

    $(document).on('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            $(element).css('z-index', 1);
            saveTreeData();
        }
    });
}

// ---------------- УПРАВЛЕНИЕ СВЯЗЯМИ ----------------

function openConnectionPanel(nodeData) {
    activeNodeIdForLinks = nodeData.id;
    $('#ft_cp_name').text(nodeData.name || "Неизвестный");
    
    // Заполняем выпадающий список другими персонажами
    const select = $('#ft_cp_target').empty();
    treeData.nodes.forEach(n => {
        if (n.id !== nodeData.id) {
            select.append(`<option value="${n.id}">${n.name || 'Без имени'}</option>`);
        }
    });

    refreshConnectionList();
    $('#ft_connection_panel').show();
}

function createLink() {
    const targetId = $('#ft_cp_target').val();
    const type = $('#ft_cp_type').val(); // 'solid' или 'dashed'
    
    if (!targetId || !activeNodeIdForLinks) return;

    // Проверяем, нет ли уже такой связи (в любом направлении)
    const exists = treeData.links.find(l => 
        (l.sourceId === activeNodeIdForLinks && l.targetId === targetId) ||
        (l.sourceId === targetId && l.targetId === activeNodeIdForLinks)
    );

    if (exists) {
        alert("Связь между этими персонажами уже существует!");
        return;
    }

    treeData.links.push({
        id: generateId(),
        sourceId: activeNodeIdForLinks,
        targetId: targetId,
        type: type
    });

    saveTreeData();
    drawLines();
    refreshConnectionList();
}

function refreshConnectionList() {
    const list = $('#ft_cp_list').empty();
    
    // Ищем все связи, связанные с активным узлом
    const activeLinks = treeData.links.filter(l => l.sourceId === activeNodeIdForLinks || l.targetId === activeNodeIdForLinks);
    
    activeLinks.forEach(link => {
        // Определяем, кто "второй" персонаж в этой связи
        const otherNodeId = link.sourceId === activeNodeIdForLinks ? link.targetId : link.sourceId;
        const otherNode = treeData.nodes.find(n => n.id === otherNodeId);
        if (!otherNode) return;

        const typeName = link.type === 'solid' ? 'Родство' : 'Брак/Иное';
        
        const li = $(`
            <li class="ft-conn-item">
                <span>${otherNode.name || 'Без имени'} (${typeName})</span>
                <span class="ft-conn-delete" title="Удалить связь">✖</span>
            </li>
        `);
        
        li.find('.ft-conn-delete').on('click', () => {
            treeData.links = treeData.links.filter(l => l.id !== link.id);
            saveTreeData();
            drawLines();
            refreshConnectionList();
        });
        
        list.append(li);
    });
}

function drawLines() {
    const svg = document.getElementById('ft_lines_layer');
    svg.innerHTML = ''; 

    treeData.links.forEach(link => {
        const n1 = treeData.nodes.find(n => n.id === link.sourceId);
        const n2 = treeData.nodes.find(n => n.id === link.targetId);
        
        if (!n1 || !n2) return; // Защита на случай поврежденных данных

        // Вычисляем центр карточек (примерная ширина 160, высота 200)
        const x1 = n1.x + 80; 
        const y1 = n1.y + 100;
        const x2 = n2.x + 80;
        const y2 = n2.y + 100;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('class', link.type === 'dashed' ? 'ft-line-dashed' : 'ft-line-solid');
        
        svg.appendChild(line);
    });
}

// ---------------- СОХРАНЕНИЕ / ЗАГРУЗКА ----------------

function getChatId() {
    return getContext().chatId || "default"; 
}

function saveTreeData() {
    const chatId = getChatId();
    if (!extension_settings[EXTENSION_NAME]) extension_settings[EXTENSION_NAME] = {};
    extension_settings[EXTENSION_NAME][chatId] = treeData;
    getContext().saveSettings();
}

function loadTreeDataForCurrentChat() {
    const chatId = getChatId();
    if (extension_settings[EXTENSION_NAME] && extension_settings[EXTENSION_NAME][chatId]) {
        treeData = extension_settings[EXTENSION_NAME][chatId];
        // Убеждаемся, что links существует для старых сохранений
        if (!treeData.links) treeData.links = [];
    } else {
        treeData = { nodes: [], links: [] };
    }
    if ($.magnificPopup.instance.isOpen && $('#family_tree_popup').is(':visible')) {
        $('#ft_connection_panel').hide();
        renderTree();
    }
}

jQuery(async () => {
    try {
        await init();
    } catch (error) {
        console.error("[Family Tree] Ошибка инициализации:", error);
    }
});
