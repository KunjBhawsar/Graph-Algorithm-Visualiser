let graph = { nodes: [], edges: [] };
let steps = [], stepIndex = 0, isPlaying = false, intervalId = null, audioEnabled = true;
let synth = window.speechSynthesis, simulation;
let edgeInputCount = 0;

let selectedVoice = null;
speechSynthesis.onvoiceschanged = () => {
    let voices = synth.getVoices();
};

function updateFinalOrderBox(text) { document.getElementById('final-order').textContent = text || ''; }

function renderPriorityQueue(pq) {
    const container = document.getElementById('priority-queue-container');
    container.innerHTML = '';
    
    if (pq.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'pq-item empty';
        emptyItem.textContent = 'Empty';
        container.appendChild(emptyItem);
        return;
    }
    
    pq.forEach(item => {
        const div = document.createElement('div');
        div.className = 'pq-item';
        div.innerHTML = `Edge: <span>${item.to}</span><br>W: ${item.weight}`;
        container.appendChild(div);
    });
}

function renderPQHistory(index) {
    const historyContainer = document.getElementById('pq-history-container');
    historyContainer.innerHTML = '';

    for (let i = 0; i <= index; i++) {
        const step = steps[i];
        const pqState = step.pqState || [];

        const historyStep = document.createElement('div');
        historyStep.className = 'history-step';

        const label = document.createElement('div');
        label.className = 'history-step-label';
        label.textContent = `Step ${i + 1}: ${step.desc}`;
        historyStep.appendChild(label);

        const pqDisplay = document.createElement('div');
        pqDisplay.className = 'history-pq-display';

        const maxSlots = 5;
        const displayItems = pqState.slice(0, maxSlots);
        const numEmpty = Math.max(0, maxSlots - displayItems.length);
        
        if (displayItems.length === 0 && numEmpty === maxSlots) {
            for (let j = 0; j < maxSlots; j++) {
                const emptyItem = document.createElement('div');
                emptyItem.className = 'history-pq-item empty';
                pqDisplay.appendChild(emptyItem);
            }
        } else {
            displayItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'history-pq-item';
                div.textContent = `${item.to}:${item.weight}`;
                pqDisplay.appendChild(div);
            });
            for (let j = 0; j < numEmpty; j++) {
                const emptyItem = document.createElement('div');
                emptyItem.className = 'history-pq-item empty';
                pqDisplay.appendChild(emptyItem);
            }
        }

        historyStep.appendChild(pqDisplay);
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
    renderGraph(); document.getElementById('step-text').textContent = `Nodes generated: ${labels.join(', ')}.\nAdd weighted edges manually then Build & Run.`;
    updateFinalOrderBox('');
    document.getElementById('priority-queue-container').innerHTML = '';
    document.getElementById('pq-history-container').innerHTML = '';
}

function addEdgeInput() {
    edgeInputCount++;
    const div = document.createElement('div'); div.className = 'edge-input';
    div.innerHTML = `Edge ${edgeInputCount}: From <input maxlength="2" placeholder="From"> ↔ To <input maxlength="2" placeholder="To"> Weight <input type="number" min="1" placeholder="W" style="width:50px;"> <button onclick="this.parentElement.remove()">Remove</button>`;
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
        const weight = parseInt(inputs[2]?.value || '0');
        
        if (graph.nodes.map(n => n.id).includes(from) && 
            graph.nodes.map(n => n.id).includes(to) && 
            from !== to && weight > 0) {
            const s = graph.nodes.find(n => n.id === from);
            const t = graph.nodes.find(n => n.id === to);
            graph.edges.push({ source: s, target: t, weight: weight });
        }
    });

    if (graph.edges.length === 0) {
        alert('Please add at least one valid edge with weight');
        return;
    }

    document.getElementById('priority-queue-container').style.display = 'flex';

    renderGraph();
    steps = []; stepIndex = 0; document.getElementById('step-text').textContent = '';
    updateFinalOrderBox('');
    document.getElementById('step-text').textContent = `Graph built. Running Prim's algorithm...\n\n`;
    primMST(start);
    
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

    const edgeLabels = svg.selectAll('.edge-weight').data(graph.edges)
        .enter().append('text')
        .attr('class', 'edge-weight')
        .text(d => d.weight);

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

            edgeLabels
                .attr('x', d => (d.source.x + d.target.x) / 2)
                .attr('y', d => (d.source.y + d.target.y) / 2);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });
}

function dragstarted(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragended(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

function primMST(startId) {
    const inMST = new Set();
    const pq = [];
    const mstEdges = [];
    let totalCost = 0;
    steps = [];

    // INITIAL: Mark all nodes as Status 1 (Not in MST)
    steps.push({
        node: null,
        edge: null,
        desc: `Mark all nodes as Status 1 (Not in MST).`,
        pqState: [],
        mstNodes: [],
        mstEdges: []
    });

    // Step 1: Add start node to MST
    inMST.add(startId);
    steps.push({
        node: startId,
        edge: null,
        desc: `Start Prim's algorithm at node ${startId}. Add it to MST.\n→ Set Node ${startId} Status to 3 (Added to MST)`,
        pqState: [],
        mstNodes: [startId],
        mstEdges: []
    });

    // Step 2: Add edges from start node to priority queue
    graph.edges.forEach(e => {
        if (e.source.id === startId && !inMST.has(e.target.id)) {
            pq.push({ from: e.source.id, to: e.target.id, weight: e.weight, edge: e });
            steps.push({
                node: e.target.id,
                edge: e,
                desc: `Edge (${e.source.id} → ${e.target.id}) added to priority queue.\n→ Set Node ${e.target.id} Status to 2 (In Queue / Candidate)`,
                pqState: [...pq],
                mstNodes: [startId],
                mstEdges: []
            });
        } else if (e.target.id === startId && !inMST.has(e.source.id)) {
            pq.push({ from: e.target.id, to: e.source.id, weight: e.weight, edge: e });
            steps.push({
                node: e.source.id,
                edge: e,
                desc: `Edge (${e.target.id} → ${e.source.id}) added to priority queue.\n→ Set Node ${e.source.id} Status to 2 (In Queue / Candidate)`,
                pqState: [...pq],
                mstNodes: [startId],
                mstEdges: []
            });
        }
    });

    pq.sort((a, b) => a.weight - b.weight);

    // Step 3: Process priority queue
    while (pq.length > 0 && inMST.size < graph.nodes.length) {
        const minEdge = pq.shift();

        if (inMST.has(minEdge.to)) {
            steps.push({
                node: minEdge.to,
                edge: minEdge.edge,
                desc: `Node ${minEdge.to} already in MST. Skip this edge.`,
                pqState: [...pq],
                mstNodes: Array.from(inMST),
                mstEdges: [...mstEdges]
            });
            continue;
        }

        // Add node to MST
        inMST.add(minEdge.to);
        mstEdges.push(minEdge.edge);
        totalCost += minEdge.weight;

        steps.push({
            node: minEdge.to,
            edge: minEdge.edge,
            desc: `Select edge (${minEdge.from} → ${minEdge.to}) with weight ${minEdge.weight}.\nAdd node ${minEdge.to} to MST.\n→ Set Node ${minEdge.to} Status to 3 (Added to MST). Total cost: ${totalCost}`,
            pqState: [...pq],
            mstNodes: Array.from(inMST),
            mstEdges: [...mstEdges]
        });

        // Add edges from the newly added node to PQ
        graph.edges.forEach(e => {
            const neighborId = (e.source.id === minEdge.to) ? e.target.id : (e.target.id === minEdge.to) ? e.source.id : null;
            if (neighborId !== null && !inMST.has(neighborId)) {
                pq.push({ from: minEdge.to, to: neighborId, weight: e.weight, edge: e });
                steps.push({
                    node: neighborId,
                    edge: e,
                    desc: `Edge (${minEdge.to} → ${neighborId}) added to priority queue.\n→ Set Node ${neighborId} Status to 2 (In Queue / Candidate)`,
                    pqState: [...pq],
                    mstNodes: Array.from(inMST),
                    mstEdges: [...mstEdges]
                });
            }
        });

        pq.sort((a, b) => a.weight - b.weight);

        if (pq.length > 0) {
            steps.push({
                node: null,
                edge: null,
                desc: `Priority queue sorted by weight.`,
                pqState: [...pq],
                mstNodes: Array.from(inMST),
                mstEdges: [...mstEdges]
            });
        }
    }

    // Prim complete
    steps.push({
        node: null,
        edge: null,
        desc: `Prim's algorithm complete.\n→ All nodes in MST have Status 3. MST constructed.`,
        pqState: [],
        mstNodes: Array.from(inMST),
        mstEdges: [...mstEdges]
    });

    updateFinalOrderBox(`MST Total Cost: ${totalCost} | Nodes in MST: ${Array.from(inMST).join(' → ')}`);
}

function highlightStep(index) {
    if (index < 0 || index >= steps.length) return;
    const svg = d3.select('#graph-svg');
    svg.selectAll('.node circle').attr('fill', '#292966');
    svg.selectAll('.edge-path').classed('mst', false).attr('stroke', '#9aa0a6').attr('stroke-width', 2);

    const currentStep = steps[index];
    
    if (currentStep.mstNodes) {
        currentStep.mstNodes.forEach(nodeId => {
            svg.selectAll('.node circle')
                .filter(d => d.id === nodeId)
                .attr('fill', nodeId === currentStep.node ? '#e9e218' : '#088a3a');
        });
    }

    if (currentStep.mstEdges) {
        currentStep.mstEdges.forEach(edge => {
            svg.selectAll('.edge-path')
                .filter(d => (d.source.id === edge.source.id && d.target.id === edge.target.id) ||
                            (d.source.id === edge.target.id && d.target.id === edge.source.id))
                .classed('mst', true).attr('stroke', '#088a3a').attr('stroke-width', 4);
        });
    }

    document.getElementById('step-text').textContent = steps.slice(0, index + 1).map(s => s.desc).join('\n\n');

    if (currentStep.pqState) {
        renderPriorityQueue(currentStep.pqState);
    }

    renderPQHistory(index);
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
        isPlaying = false; document.getElementById('play-pause').textContent = 'Play';
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        synth.cancel();
    }
    if (stepIndex < steps.length - 1) stepIndex++;
    highlightStep(stepIndex);
    speakCurrentStep();
}

function stepBackward() {
    if (isPlaying) {
        isPlaying = false; document.getElementById('play-pause').textContent = 'Play';
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        synth.cancel();
    }
    if (stepIndex > 0) stepIndex--;
    highlightStep(stepIndex);
    speakCurrentStep();
}

function clearGraph() {
    if (simulation) { simulation.stop(); simulation = null; }
    graph.nodes = []; graph.edges = []; steps = []; stepIndex = 0; edgeInputCount = 0;
    document.getElementById('edge-list').innerHTML = '';
    document.getElementById('step-text').textContent = '';
    updateFinalOrderBox('');
    d3.select('#graph-svg').selectAll('*').remove();
    document.getElementById('priority-queue-container').innerHTML = '';
    document.getElementById('priority-queue-container').style.display = 'none';
    document.getElementById('pq-history-container').innerHTML = '';
}

function showSection(section) {
    alert(`Navigating to ${section} section (functionality to be implemented)`);
}

window.addEventListener('resize', () => {
    if (simulation) {
        const svg = d3.select('#graph-svg');
        simulation.force('center', d3.forceCenter(svg.node().clientWidth / 2, svg.node().clientHeight / 2));
        simulation.alpha(0.5).restart();
    }
});
