let graph = { nodes: [], edges: [] };
let steps = [], stepIndex = 0, isPlaying = false, intervalId = null, audioEnabled = true;
let synth = window.speechSynthesis, simulation;
let edgeInputCount = 0;

let selectedVoice = null;
speechSynthesis.onvoiceschanged = () => {
    let voices = synth.getVoices();
};

function updateFinalOrderBox(text) { document.getElementById('final-order').textContent = text || ''; }

function renderDataStructure(dataStructure) {
    const container = document.getElementById('stack-container');
    container.innerHTML = '';

    const maxSlots = 5;
    const numEmpty = Math.max(0, maxSlots - dataStructure.length);
    
    for (let i = 0; i < numEmpty; i++) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'stack-item empty';
        container.appendChild(emptyItem);
    }
    
    dataStructure.forEach(item => {
        const div = document.createElement('div');
        div.className = 'stack-item';
        div.textContent = typeof item === 'object' ? item.id : item;
        container.insertBefore(div, container.firstChild);
    });
}

function renderStackHistory(index) {
    const historyContainer = document.getElementById('stack-history-container');
    historyContainer.innerHTML = '';

    for (let i = 0; i <= index; i++) {
        const step = steps[i];
        const dataStructure = step.stackState;

        const historyStep = document.createElement('div');
        historyStep.className = 'history-step';

        const label = document.createElement('div');
        label.className = 'history-step-label';
        label.textContent = `Step ${i + 1}: ${step.desc}`;
        historyStep.appendChild(label);

        const stackDisplay = document.createElement('div');
        stackDisplay.className = 'history-stack-display';

        const maxSlots = 5;
        const numEmpty = Math.max(0, maxSlots - dataStructure.length);

        for (let j = 0; j < numEmpty; j++) {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'history-stack-item empty';
            stackDisplay.appendChild(emptyItem);
        }

        dataStructure.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-stack-item';
            div.textContent = typeof item === 'object' ? item.id : item;
            stackDisplay.appendChild(div);
        });

        historyStep.appendChild(stackDisplay);
        historyContainer.appendChild(historyStep);
    }

    historyContainer.scrollTop = historyContainer.scrollHeight;
}

function updateSliderFill(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const value = parseFloat(slider.value);
    const percentage = ((value - min) / (max - min)) * 100;

    slider.style.background = `linear-gradient(to right, #292966 ${percentage}%, #ddd ${percentage}%)`;
}

function generateNodes() {
    const num = parseInt(document.getElementById('num-nodes').value);
    if (!(num >= 1 && num <= 20)) { alert('Nodes must be 1–20'); return; }
    const labels = Array.from({ length: num }, (_, i) => (i + 1).toString());
    const startSelect = document.getElementById('start-node');
    startSelect.innerHTML = '';
    labels.forEach(l => { let o = document.createElement('option'); o.value = l; o.text = l; startSelect.appendChild(o); });
    graph.nodes = labels.map(l => ({ id: l, x: 150 + Math.random() * 600, y: 100 + Math.random() * 350 }));
    graph.edges = []; document.getElementById('edge-list').innerHTML = ''; edgeInputCount = 0;
    renderGraph(); document.getElementById('step-text').textContent = `Nodes generated: ${labels.join(', ')}.\nAdd edges manually then Build & Run.`;
    updateFinalOrderBox('');
    document.getElementById('stack-container').innerHTML = '';
    document.getElementById('stack-history-container').innerHTML = '';
}

function addEdgeInput() {
    edgeInputCount++;
    const div = document.createElement('div'); div.className = 'edge-input';
    div.innerHTML = `Edge ${edgeInputCount}: From <input maxlength="1" placeholder="Starting"> ➤ To <input maxlength="1" placeholder="Ending"> <button onclick="this.parentElement.remove()">Remove</button>`;
    document.getElementById('edge-list').appendChild(div);
}

function buildGraph() {
    if (!graph.nodes.length) { alert('Generate nodes first'); return; }
    const start = document.getElementById('start-node').value;
    if (!graph.nodes.map(n => n.id).includes(start)) { alert('Invalid start node'); return; }

    graph.edges = [];
    document.querySelectorAll('#edge-list .edge-input').forEach(div => {
        const inputs = div.querySelectorAll('input'); 
        const from = (inputs[0]?.value || '').toUpperCase(); 
        const to = (inputs[1]?.value || '').toUpperCase();
        if (graph.nodes.map(n => n.id).includes(from) && graph.nodes.map(n => n.id).includes(to) && from !== to) {
            const s = graph.nodes.find(n => n.id === from); 
            const t = graph.nodes.find(n => n.id === to);
            graph.edges.push({ source: s, target: t });
        }
    });

    renderGraph();
    steps = []; 
    stepIndex = 0; 
    document.getElementById('step-text').textContent = '';
    updateFinalOrderBox('');
    document.getElementById('step-text').textContent = `Graph built. Running traversal...\n\n`;
    dfs(start);
    
    stepIndex = 0;
    highlightStep(stepIndex);
}

function renderGraph() {
    const svg = d3.select('#graph-svg');
    svg.selectAll('*').remove();

    const link = svg.selectAll('.edge-path').data(graph.edges)
        .enter().append('line')
        .attr('class', 'edge-path')
        .attr('stroke', '#9aa0a6')
        .attr('stroke-width', 2);

    const node = svg.selectAll('.node').data(graph.nodes)
        .enter().append('g')
        .attr('class', 'node')
        .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

    node.append('circle').attr('r', 20).attr('fill', '#292966');
    node.append('text').text(d => d.id).attr('dy', 0).attr('dx', 0);

    if (simulation) simulation.stop();
    simulation = d3.forceSimulation(graph.nodes)
        .force('link', d3.forceLink(graph.edges).id(d => d.id).distance(140))
        .force('charge', d3.forceManyBody().strength(-400))
        .force('center', d3.forceCenter(svg.node().clientWidth / 2, svg.node().clientHeight / 2))
        .on('tick', () => {
            link.attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });
}

function dragstarted(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragended(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

function dfs(startId) {
    const startNode = graph.nodes.find(n => n.id === startId);
    if (!startNode) return;

    const visited = new Set();
    const stack = [];
    const order = [];
    steps = [];

    // INITIAL: Mark all nodes as Status 1 (Unvisited)
    steps.push({
        node: null,
        edge: null,
        desc: `Mark all nodes as Status 1 (UNVISITED).`,
        stackState: []
    });

    // Start DFS: Push start node
    stack.push(startNode);
    steps.push({
        node: startId,
        edge: null,
        desc: `Start DFS at node ${startId}. Push it onto the stack.\n➤ Set Node ${startId} Status to 2 (On Stack / Visited)`,
        stackState: stack.map(n => n.id)
    });

    while (stack.length) {
        const currentNode = stack.pop();
        const u = currentNode.id;

        // If already visited, skip
        if (visited.has(u)) {
            steps.push({
                node: u,
                edge: null,
                desc: `Node ${u} already visited and on Status 3. Skipping.`,
                stackState: stack.map(n => n.id)
            });
            continue;
        }

        visited.add(u);
        order.push(u);

        // Node is now processed
        steps.push({
            node: u,
            edge: null,
            desc: `Pop Node ${u} from stack.\n➤ Set Node ${u} Status to 3 (Processed)`,
            stackState: stack.map(n => n.id)
        });

        // Explore neighbors (in reverse for correct order in stack)
        const neighbors = graph.edges.filter(
            e => e.source.id === u || e.target.id === u
        );

        for (let i = neighbors.length - 1; i >= 0; i--) {
            const edge = neighbors[i];
            const v = (edge.source.id === u) ? edge.target.id : edge.source.id;

            if (!visited.has(v) && !stack.some(n => n.id === v)) {
                const neighborNode = graph.nodes.find(n => n.id === v);
                stack.push(neighborNode);
                steps.push({
                    node: v,
                    edge: edge,
                    desc: `Discover Node ${v} from ${u}. Push ${v} onto the stack.\n➤ Set Node ${v} Status to 2 (On Stack / Visited)`,
                    stackState: stack.map(n => n.id)
                });
            } else {
                steps.push({
                    node: v,
                    edge: edge,
                    desc: `Neighbor ${v} already visited or on stack. Skipping.`,
                    stackState: stack.map(n => n.id)
                });
            }
        }
    }

    // DFS Complete
    steps.push({
        node: null,
        edge: null,
        desc: `DFS Traversal Complete.\n➤ All nodes are now at Status 3 (Processed).`,
        stackState: []
    });

    updateFinalOrderBox(`Final order: ${order.join(' ➤ ')}`);
}


function highlightStep(index) {
    if (index < 0 || index >= steps.length) return;
    const svg = d3.select('#graph-svg');
    svg.selectAll('.node circle').attr('fill', '#292966');
    svg.selectAll('.edge-path').classed('traversal', false).attr('stroke', '#9aa0a6').attr('stroke-width', 2);

    for (let i = 0; i <= index; i++) {
        const s = steps[i];
        if (s.node) {
            svg.selectAll('.node circle').filter(d => d.id === s.node).attr('fill', i === index ? '#e9e218' : '#088a3a');
        }
        if (s.edge) {
            svg.selectAll('.edge-path').filter(d => d.source.id === s.edge.source.id && d.target.id === s.edge.target.id)
                .classed('traversal', true).attr('stroke', '#db1111').attr('stroke-width', 3.5);
        }
    }

    document.getElementById('step-text').textContent = steps.slice(0, index + 1).map(s => s.desc).join('\n\n');

    const currentStep = steps[index];
    if (currentStep.stackState) {
        document.getElementById('stack-container').className = 'dfs';
        renderDataStructure(currentStep.stackState);
    }

    renderStackHistory(index);
}

function speakCurrentStep(onEndCallback) {
    if (!audioEnabled || !('speechSynthesis' in window)) {
        if (typeof onEndCallback === 'function') onEndCallback();
        return;
    }
    const text = steps[stepIndex] ? steps[stepIndex].desc : '';
    if (!text) {
        if (typeof onEndCallback === 'function') onEndCallback();
        return;
    }
    synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utt.voice = selectedVoice;
    utt.rate = parseFloat(document.getElementById('speech-rate').value || '0.8');
    utt.onend = () => { if (typeof onEndCallback === 'function') onEndCallback(); };
    synth.speak(utt);
}

function playPause() {
    const playBtn = document.getElementById('play-pause');
    if (isPlaying) {
        isPlaying = false;
        playBtn.textContent = 'Play';
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        synth.cancel();
        return;
    }

    isPlaying = true;
    playBtn.textContent = 'Pause';

    highlightStep(stepIndex);
    speakCurrentStep(() => {
        if (!isPlaying) return;
        const next = function () {
            if (!isPlaying) return;
            if (stepIndex < steps.length - 1) {
                stepIndex++;
                highlightStep(stepIndex);
                speakCurrentStep(next);
            } else {
                isPlaying = false;
                document.getElementById('play-pause').textContent = 'Play';
            }
        };
        next();
    });
}

function stepForward() {
    if (isPlaying) {
        isPlaying = false; 
        document.getElementById('play-pause').textContent = 'Play';
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        synth.cancel();
    }
    if (stepIndex < steps.length - 1) stepIndex++;
    highlightStep(stepIndex);
    speakCurrentStep();
}

function stepBackward() {
    if (isPlaying) {
        isPlaying = false; 
        document.getElementById('play-pause').textContent = 'Play';
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        synth.cancel();
    }
    if (stepIndex > 0) stepIndex--;
    highlightStep(stepIndex);
    speakCurrentStep();
}

function clearGraph() {
    if (simulation) { simulation.stop(); simulation = null; }
    graph.nodes = []; 
    graph.edges = []; 
    steps = []; 
    stepIndex = 0; 
    edgeInputCount = 0;
    document.getElementById('edge-list').innerHTML = '';
    document.getElementById('step-text').textContent = '';
    updateFinalOrderBox('');
    d3.select('#graph-svg').selectAll('*').remove();
    document.getElementById('stack-container').innerHTML = '';
    document.getElementById('stack-history-container').innerHTML = '';
}

window.addEventListener('resize', () => {
    if (simulation) {
        const svg = d3.select('#graph-svg');
        simulation.force('center', d3.forceCenter(svg.node().clientWidth / 2, svg.node().clientHeight / 2));
        simulation.alpha(0.5).restart();
    }
});
