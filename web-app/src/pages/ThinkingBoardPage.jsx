// ========= Strategic Issue Tree (思维画板 - Issue Tree 模式) =========

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Brain, Sparkles, ChevronRight, ChevronDown, Check, X, Play, Minus, Loader2, Plus, Trash2, ExternalLink } from 'lucide-react';
import { boardsApi, cardsApi, aiBoardsApi } from '../lib/api';
import { useUIStore, useCardsStore } from '../lib/store';
import AddCardSection from '../components/AddCardSection';

// 构建带 Text Fragment 的高亮链接 (同 CardsPage)
function buildHighlightUrl(baseUrl, rawSnippet) {
    if (!baseUrl || !rawSnippet) return baseUrl || '#';
    try {
        const url = new URL(baseUrl);
        const cleanText = rawSnippet.replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!cleanText) return baseUrl;
        const encodedText = encodeURIComponent(cleanText).replace(/-/g, '%2D');
        url.hash = `:~:text=${encodedText}`;
        return url.toString();
    } catch {
        return baseUrl;
    }
}

// ========= Helper: Editable Text Component =========
const EditableText = ({ text, onSave, className, placeholder, isEditing, setEditing }) => {
    const inputRef = useRef(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave(e.target.value);
            setEditing(false);
        }
        if (e.key === 'Escape') {
            setEditing(false);
        }
    };

    const handleBlur = (e) => {
        onSave(e.target.value);
        setEditing(false);
    };

    if (isEditing) {
        return (
            <textarea
                ref={inputRef}
                defaultValue={text}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className={`w-full bg-white text-slate-900 p-2 rounded border-2 border-blue-400 outline-none resize-none overflow-hidden ${className}`}
                placeholder={placeholder}
                rows={2}
            />
        );
    }

    return (
        <div
            className={`cursor-text hover:bg-black/5 p-1 -m-1 rounded transition-colors ${className}`}
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        >
            {text || <span className="text-slate-400 italic">{placeholder}</span>}
        </div>
    );
};

// ========= Main Component =========
export default function ThinkingBoardPage() {
    const { topicId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useUIStore();
    const { cards: allCards, fetchCards } = useCardsStore();

    // --- Board & Topic Meta State ---
    const [boardId, setBoardId] = useState(null);
    const [boardTitle, setBoardTitle] = useState('');
    const [topic, setTopic] = useState(null);

    // --- Tree State ---
    const [rootQuestion, setRootQuestion] = useState({
        id: 'root',
        text: '',
        isOpen: true,
    });

    const [subQuestions, setSubQuestions] = useState([]);
    const [hypotheses, setHypotheses] = useState([]);
    const [evidence, setEvidence] = useState([]);

    // UI States
    const [expandedSubQs, setExpandedSubQs] = useState(new Set());
    const [editingNodes, setEditingNodes] = useState(new Set());
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showCardCreator, setShowCardCreator] = useState(false);
    const [showAllCards, setShowAllCards] = useState(false); // Card filter toggle

    // --- Drag State ---
    const [draggedCard, setDraggedCard] = useState(null);
    const [dragOverHypo, setDragOverHypo] = useState(null);

    // --- Refs ---
    const canvasRef = useRef(null);
    const svgRef = useRef(null);
    const nodeRefs = useRef({});

    // Filtered cards based on toggle
    const filteredCards = showAllCards
        ? allCards
        : allCards.filter(card => card.topic_id === topicId);

    // ========= Load Board Data via Topic =========
    useEffect(() => {
        fetchCards();

        const loadBoard = async () => {
            if (!topicId) {
                setIsLoading(false);
                return;
            }

            try {
                // Use the new idempotent API that gets/creates board for topic
                const response = await boardsApi.getTopicBoard(topicId);
                const board = response.board;
                setTopic(response.topic);

                if (board) {
                    setBoardId(board.id);
                    setBoardTitle(board.title || response.topic?.title || 'Untitled');

                    // Parse nodes into tree structure
                    const nodes = board.nodes || [];
                    const edges = board.edges || [];

                    // Find root node (question with isRoot flag)
                    const rootNode = nodes.find(n =>
                        n.node_type === 'question' && n.content?.isRoot
                    );
                    const rootDbId = rootNode?.id;

                    if (rootNode) {
                        // Always use 'root' as internal ID for root node consistency
                        setRootQuestion({ id: 'root', text: rootNode.content?.text || '', isOpen: true, dbId: rootDbId });
                    }

                    // Find sub-questions (question with isSubQ flag)
                    const sqNodes = nodes.filter(n =>
                        n.node_type === 'question' && n.content?.isSubQ
                    );
                    // Hypotheses use the 'hypothesis' type directly
                    const hypoNodes = nodes.filter(n => n.node_type === 'hypothesis');
                    // Evidence uses 'card_ref' type
                    const evNodes = nodes.filter(n => n.node_type === 'card_ref');

                    // Build ID mapping: dbId -> localId
                    const dbToLocalId = { [rootDbId]: 'root' };
                    sqNodes.forEach(sq => { dbToLocalId[sq.id] = sq.id; });
                    hypoNodes.forEach(h => { dbToLocalId[h.id] = h.id; });
                    evNodes.forEach(ev => { dbToLocalId[ev.id] = ev.id; });

                    // Build relationships from edges (normalize parent IDs)
                    const newSubQs = sqNodes.map(sq => {
                        const parentEdge = edges.find(e => e.target_node_id === sq.id);
                        const parentDbId = parentEdge?.source_node_id;
                        const parentId = dbToLocalId[parentDbId] || 'root';
                        return { id: sq.id, parentId, text: sq.content?.text || '' };
                    });

                    const newHypos = hypoNodes.map(h => {
                        const parentEdge = edges.find(e => e.target_node_id === h.id);
                        const parentDbId = parentEdge?.source_node_id;
                        const parentId = dbToLocalId[parentDbId] || '';
                        return { id: h.id, parentId, text: h.content?.text || '' };
                    });

                    const newEvidence = evNodes.map(ev => {
                        const parentEdge = edges.find(e => e.target_node_id === ev.id);
                        const parentDbId = parentEdge?.source_node_id;
                        const parentId = dbToLocalId[parentDbId] || '';
                        return {
                            id: ev.id,
                            parentId,
                            text: ev.content?.text || '',
                            status: ev.content?.status || 'neutral',
                            explanation: ev.content?.explanation || '',
                            sourceCardId: ev.card_id || null
                        };
                    });

                    setSubQuestions(newSubQs);
                    setHypotheses(newHypos);
                    setEvidence(newEvidence);
                    setExpandedSubQs(new Set(sqNodes.map(sq => sq.id)));
                }

            } catch (error) {
                console.error('Failed to load board:', error);
                showToast('加载画板失败', 'error');
            }
            setIsLoading(false);
        };

        loadBoard();
    }, [topicId, fetchCards, showToast]);

    // ========= Save Board =========
    const handleSave = useCallback(async () => {
        if (isSaving) return;
        setIsSaving(true);

        try {
            let currentBoardId = boardId;

            if (!currentBoardId) {
                showToast('画板未加载，请刷新页面', 'error');
                setIsSaving(false);
                return;
            }

            // Update board title to match topic title
            await boardsApi.update(currentBoardId, { title: topic?.title || boardTitle });

            // 2. Delete all existing nodes (cascade deletes edges)
            const existingNodes = await boardsApi.listNodes(currentBoardId);
            for (const node of existingNodes.nodes || []) {
                await boardsApi.deleteNode(currentBoardId, node.id);
            }

            // 3. Create new nodes and track ID mappings
            const nodeIdMap = {}; // tempId -> dbId

            // 3.1 Root Node (use 'question' type with isRoot flag)
            const rootNodeResponse = await boardsApi.createNode(currentBoardId, {
                node_type: 'question',
                content: { text: rootQuestion.text, isRoot: true },
                position_x: 0,
                position_y: 0
            });
            nodeIdMap['root'] = rootNodeResponse.node.id;

            // 3.2 Sub-Questions (use 'question' type with isSubQ flag)
            for (const sq of subQuestions) {
                const sqResponse = await boardsApi.createNode(currentBoardId, {
                    node_type: 'question',
                    content: { text: sq.text, isSubQ: true },
                    position_x: 400,
                    position_y: subQuestions.indexOf(sq) * 200
                });
                nodeIdMap[sq.id] = sqResponse.node.id;

                // Edge: Root -> SubQ (use 'answers' relation)
                await boardsApi.createEdge(currentBoardId, {
                    source_node_id: nodeIdMap['root'],
                    target_node_id: sqResponse.node.id,
                    relation_type: 'related'
                });
            }

            // 3.3 Hypotheses
            for (const h of hypotheses) {
                const hResponse = await boardsApi.createNode(currentBoardId, {
                    node_type: 'hypothesis',
                    content: { text: h.text },
                    position_x: 800,
                    position_y: hypotheses.indexOf(h) * 150
                });
                nodeIdMap[h.id] = hResponse.node.id;

                // Edge: SubQ -> Hypothesis (use 'answers' relation)
                if (nodeIdMap[h.parentId]) {
                    await boardsApi.createEdge(currentBoardId, {
                        source_node_id: nodeIdMap[h.parentId],
                        target_node_id: hResponse.node.id,
                        relation_type: 'answers'
                    });
                }
            }

            // 3.4 Evidence (use 'card_ref' type)
            for (const ev of evidence) {
                const evResponse = await boardsApi.createNode(currentBoardId, {
                    node_type: 'card_ref',
                    content: { text: ev.text, status: ev.status, explanation: ev.explanation },
                    card_id: ev.sourceCardId || null,
                    position_x: 1200,
                    position_y: evidence.indexOf(ev) * 120
                });
                nodeIdMap[ev.id] = evResponse.node.id;

                // Edge: Hypothesis -> Evidence (use 'supports'/'refutes'/'related')
                if (nodeIdMap[ev.parentId]) {
                    let relType = 'related';
                    if (ev.status === 'support') relType = 'supports';
                    if (ev.status === 'refute') relType = 'refutes';

                    await boardsApi.createEdge(currentBoardId, {
                        source_node_id: nodeIdMap[ev.parentId],
                        target_node_id: evResponse.node.id,
                        relation_type: relType
                    });
                }
            }

            showToast('保存成功！', 'success');

        } catch (error) {
            console.error('Save failed:', error);
            showToast(`保存失败: ${error.message}`, 'error');
        }

        setIsSaving(false);
    }, [isSaving, boardId, boardTitle, rootQuestion, subQuestions, hypotheses, evidence, showToast]);

    // ========= Interaction Handlers =========
    const updateRootText = (newText) => {
        setRootQuestion(prev => ({ ...prev, text: newText }));
    };

    const handleAIAnalyze = useCallback(async () => {
        if (isAnalyzing) return;
        if (!rootQuestion.text || rootQuestion.text.length < 5) {
            showToast('请输入更具体的核心问题', 'error');
            return;
        }

        setIsAnalyzing(true);

        try {
            showToast('AI 正在拆解问题...', 'info');
            const response = await aiBoardsApi.analyzeRoot(rootQuestion.text);
            const result = response.data;

            if (!result || !result.sub_questions) {
                throw new Error("AI 返回数据格式错误");
            }

            const newSubQs = [];
            const newHypos = [];
            const newExpanded = new Set();

            result.sub_questions.forEach((sq, idx) => {
                const sqId = `sq-${Date.now()}-${idx}`;
                newSubQs.push({ id: sqId, parentId: 'root', text: sq.text });
                newExpanded.add(sqId);

                if (sq.hypotheses) {
                    sq.hypotheses.forEach((h, hIdx) => {
                        newHypos.push({ id: `h-${Date.now()}-${idx}-${hIdx}`, parentId: sqId, text: h.text });
                    });
                }
            });

            setSubQuestions(newSubQs);
            setHypotheses(newHypos);
            setExpandedSubQs(newExpanded);
            showToast('AI 分析完成，正在匹配卡片...', 'info');

            // Auto-match cards from current Topic to hypotheses
            const topicCards = filteredCards;
            const newEvidence = [];

            if (topicCards.length > 0 && newHypos.length > 0) {
                for (const card of topicCards) {
                    const cardContent = card.summary || card.raw_snippet || '';
                    if (!cardContent.trim()) continue;

                    // Find the most relevant hypothesis for this card
                    // Simple approach: try to verify against each hypothesis
                    for (const hypo of newHypos) {
                        try {
                            const verifyResult = await aiBoardsApi.verify(hypo.text, cardContent);
                            const data = verifyResult.data;

                            if (data && (data.status === 'support' || data.status === 'refute')) {
                                // This card is evidence for this hypothesis
                                newEvidence.push({
                                    id: `ev-${Date.now()}-${card.id}`,
                                    parentId: hypo.id,
                                    text: cardContent.slice(0, 150) + (cardContent.length > 150 ? '...' : ''),
                                    status: data.status,
                                    explanation: data.explanation || '',
                                    sourceCardId: card.id
                                });
                                break; // Each card matches at most one hypothesis
                            }
                        } catch (err) {
                            console.warn('Card verification skipped:', err.message);
                        }
                    }
                }
            }

            setEvidence(newEvidence);
            setIsAnalyzing(false);

            const matchCount = newEvidence.length;
            showToast(`AI 分析完成！${matchCount > 0 ? ` 自动匹配了 ${matchCount} 张卡片` : ''}`, 'success');

        } catch (error) {
            console.error(error);
            showToast(`AI 分析失败: ${error.message}`, 'error');
            setIsAnalyzing(false);
        }
    }, [isAnalyzing, rootQuestion.text, filteredCards, showToast]);

    const toggleEditing = (id, isEditing) => {
        setEditingNodes(prev => {
            const next = new Set(prev);
            if (isEditing) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const updateSubQText = (id, newText) => {
        setSubQuestions(prev => prev.map(sq => sq.id === id ? { ...sq, text: newText } : sq));
    };

    const updateHypoText = (id, newText) => {
        setHypotheses(prev => prev.map(h => h.id === id ? { ...h, text: newText } : h));
    };

    const toggleSubQExpand = (id) => {
        setExpandedSubQs(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ========= Manual Node Creation =========
    const addSubQuestion = () => {
        const newId = `sq-${Date.now()}`;
        setSubQuestions(prev => [...prev, { id: newId, parentId: 'root', text: '' }]);
        setExpandedSubQs(prev => new Set([...prev, newId]));
        // Auto-start editing the new node
        setTimeout(() => setEditingNodes(prev => new Set([...prev, newId])), 50);
    };

    const addHypothesis = (parentSqId) => {
        const newId = `h-${Date.now()}`;
        setHypotheses(prev => [...prev, { id: newId, parentId: parentSqId, text: '' }]);
        // Auto-start editing the new node
        setTimeout(() => setEditingNodes(prev => new Set([...prev, newId])), 50);
    };

    // ========= Delete Node Handlers =========
    const deleteSubQuestion = (sqId) => {
        // Remove the sub-question
        setSubQuestions(prev => prev.filter(sq => sq.id !== sqId));
        // Remove all hypotheses under this sub-question
        const hyposToDelete = hypotheses.filter(h => h.parentId === sqId).map(h => h.id);
        setHypotheses(prev => prev.filter(h => h.parentId !== sqId));
        // Remove all evidence under those hypotheses
        setEvidence(prev => prev.filter(ev => !hyposToDelete.includes(ev.parentId)));
        // Remove from expanded set
        setExpandedSubQs(prev => {
            const next = new Set(prev);
            next.delete(sqId);
            return next;
        });
    };

    const deleteHypothesis = (hypoId) => {
        // Remove the hypothesis
        setHypotheses(prev => prev.filter(h => h.id !== hypoId));
        // Remove all evidence under this hypothesis
        setEvidence(prev => prev.filter(ev => ev.parentId !== hypoId));
    };

    const deleteEvidence = (evId) => {
        setEvidence(prev => prev.filter(ev => ev.id !== evId));
    };

    const handleDragStart = (card) => setDraggedCard(card);
    const handleDragOver = (e, hypoId) => { e.preventDefault(); setDragOverHypo(hypoId); };
    const handleDragLeave = () => setDragOverHypo(null);

    const handleDrop = async (e, hypoId) => {
        e.preventDefault();
        setDragOverHypo(null);
        if (!draggedCard) return;

        const targetHypo = hypotheses.find(h => h.id === hypoId);
        if (!targetHypo) return;

        const cardContent = draggedCard.summary || draggedCard.raw_snippet || '(无内容)';

        const newEvidence = {
            id: `ev-${Date.now()}`,
            text: cardContent,
            parentId: hypoId,
            sourceCardId: draggedCard.id,
            status: 'analyzing',
            explanation: '',
        };

        setEvidence(prev => [...prev, newEvidence]);
        setDraggedCard(null);
        showToast('AI 正在验证证据...', 'info');

        try {
            const response = await aiBoardsApi.verify(targetHypo.text, cardContent);
            const { status, explanation } = response.data;

            setEvidence(prev => prev.map(ev =>
                ev.id === newEvidence.id
                    ? { ...ev, status: status || 'neutral', explanation }
                    : ev
            ));
            showToast('验证完成', 'success');
        } catch (error) {
            console.error(error);
            setEvidence(prev => prev.map(ev =>
                ev.id === newEvidence.id
                    ? { ...ev, status: 'neutral', explanation: 'AI 验证失败' }
                    : ev
            ));
            showToast('验证失败', 'error');
        }
    };

    // ========= SVG Drawing =========
    const drawLines = useCallback(() => {
        if (!svgRef.current || !canvasRef.current || !rootQuestion) return;

        const svg = svgRef.current;
        const canvas = canvasRef.current;
        const canvasRect = canvas.getBoundingClientRect();
        const scrollLeft = canvas.scrollLeft;
        const scrollTop = canvas.scrollTop;

        svg.innerHTML = `
      <defs>
        <marker id="arrow-gray" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#94a3b8" /></marker>
        <marker id="arrow-purple" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#a855f7" /></marker>
        <marker id="arrow-green" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#16a34a" /></marker>
        <marker id="arrow-red" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#dc2626" /></marker>
        <marker id="arrow-neutral" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#cbd5e1" /></marker>
      </defs>
    `;

        const createBezier = (startId, endId, color, marker) => {
            const startEl = nodeRefs.current[startId];
            const endEl = nodeRefs.current[endId];
            if (!startEl || !endEl) return;
            const sRect = startEl.getBoundingClientRect();
            const eRect = endEl.getBoundingClientRect();
            if (sRect.width === 0 || eRect.width === 0) return;

            const x1 = sRect.right - canvasRect.left + scrollLeft;
            const y1 = sRect.top + sRect.height / 2 - canvasRect.top + scrollTop;
            const x2 = eRect.left - canvasRect.left + scrollLeft;
            const y2 = eRect.top + eRect.height / 2 - canvasRect.top + scrollTop;

            const cpOFFSET = 60;
            const d = `M ${x1} ${y1} C ${x1 + cpOFFSET} ${y1}, ${x2 - cpOFFSET} ${y2}, ${x2} ${y2}`;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            if (marker) path.setAttribute('marker-end', marker);
            svg.appendChild(path);
        };

        subQuestions.forEach(sq => createBezier('root', sq.id, '#94a3b8', 'url(#arrow-gray)'));

        expandedSubQs.forEach(sqId => {
            hypotheses.filter(h => h.parentId === sqId).forEach(h => {
                createBezier(sqId, h.id, '#a855f7', 'url(#arrow-purple)');
                evidence.filter(e => e.parentId === h.id).forEach(ev => {
                    let color = '#cbd5e1';
                    let marker = 'url(#arrow-neutral)';
                    if (ev.status === 'support') { color = '#16a34a'; marker = 'url(#arrow-green)'; }
                    if (ev.status === 'refute') { color = '#dc2626'; marker = 'url(#arrow-red)'; }

                    createBezier(h.id, ev.id, color, marker);
                });
            });
        });
    }, [subQuestions, expandedSubQs, hypotheses, evidence, rootQuestion]);

    useLayoutEffect(() => { setTimeout(drawLines, 50); }, [drawLines, expandedSubQs, hypotheses, evidence]);
    useEffect(() => {
        const handleResize = () => drawLines();
        window.addEventListener('resize', handleResize);
        canvasRef.current?.addEventListener('scroll', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawLines]);

    const setNodeRef = (id) => (el) => { nodeRefs.current[id] = el; };

    // ========= Render =========
    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50 text-slate-900">
            {/* Toolbar */}
            <div className="flex-none bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-30">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-gradient-to-br from-purple-100 to-blue-50 rounded-lg border border-purple-100">
                            <Brain className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">
                                {topic?.title || boardTitle || '思维画板'}
                            </h1>
                            <p className="text-xs text-slate-500">AI-Powered Strategic Issue Tree</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${isSaving
                        ? 'bg-slate-200 text-slate-400 cursor-wait'
                        : 'bg-purple-600 hover:bg-purple-700 text-white shadow-md'
                        }`}
                >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {isSaving ? '保存中...' : '保存'}
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-80 bg-white border-r flex flex-col shadow-lg z-20 flex-none">
                    <div className="p-5 border-b bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">📚 Evidence Pool</h3>
                        <p className="text-xs text-slate-500 mt-1">Drag cards to Hypotheses (AI Verify)</p>

                        {/* Topic Filter Toggle */}
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                onClick={() => setShowAllCards(false)}
                                className={`text-xs px-2 py-1 rounded-full transition-all ${!showAllCards
                                    ? 'bg-blue-100 text-blue-700 font-medium'
                                    : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                当前 Topic
                            </button>
                            <button
                                onClick={() => setShowAllCards(true)}
                                className={`text-xs px-2 py-1 rounded-full transition-all ${showAllCards
                                    ? 'bg-blue-100 text-blue-700 font-medium'
                                    : 'text-slate-500 hover:bg-slate-100'}`}
                            >
                                全部卡片
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {filteredCards.map(card => {
                            const sourceName = card.source?.name || (card.source_url ? (() => { try { return new URL(card.source_url).hostname.replace('www.', ''); } catch { return ''; } })() : '');
                            return (
                                <div key={card.id} draggable onDragStart={() => handleDragStart(card)}
                                    className="bg-white border p-3 rounded-lg hover:border-blue-500 cursor-grab shadow-sm text-sm group/card"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="font-bold text-slate-500 text-[10px]">CARD #{card.id.slice(0, 4)}</div>
                                        {card.source_url && (
                                            <a
                                                href={buildHighlightUrl(card.source_url, card.raw_snippet)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="opacity-0 group-hover/card:opacity-100 text-blue-500 hover:text-blue-700 transition-all p-0.5"
                                                title="跳转原文高亮"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <ExternalLink size={12} />
                                            </a>
                                        )}
                                    </div>
                                    {sourceName && (
                                        <div className="text-[10px] text-blue-600 mb-1 truncate">📰 {sourceName}</div>
                                    )}
                                    <div className="line-clamp-2 text-slate-700 mb-1">{card.summary || 'No Content'}</div>
                                    {card.raw_snippet && (
                                        <details className="group/details">
                                            <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600 select-none">查看原文</summary>
                                            <div className="mt-1 p-2 bg-slate-50 rounded text-[11px] text-slate-600 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                                                {card.raw_snippet}
                                            </div>
                                        </details>
                                    )}
                                </div>
                            );
                        })}

                        {filteredCards.length === 0 && (
                            <div className="text-center text-slate-400 text-sm py-8">
                                {showAllCards ? '暂无卡片，点击下方创建' : '当前 Topic 暂无卡片'}
                            </div>
                        )}
                    </div>

                    {/* Card Creator Section */}
                    <div className="border-t">
                        <button
                            onClick={() => setShowCardCreator(!showCardCreator)}
                            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                        >
                            <span className="font-semibold text-slate-700 flex items-center gap-2">
                                <Plus size={16} className="text-green-600" />
                                新建卡片
                            </span>
                            {showCardCreator ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                        </button>

                        {showCardCreator && (
                            <div className="p-4 pt-0 border-t bg-slate-50/50">
                                <AddCardSection onCardAdded={() => { fetchCards(); setShowCardCreator(false); }} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Canvas */}
                <div ref={canvasRef} className="flex-1 relative overflow-auto bg-slate-50"
                    style={{ backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)', backgroundSize: '32px 32px' }}>

                    <svg ref={svgRef} className="absolute top-0 left-0 pointer-events-none z-0" style={{ width: '4000px', height: '4000px' }} />

                    <div className="inline-flex flex-row items-center p-20 gap-32 min-w-max min-h-[800px]">

                        {/* LEVEL 1: Root */}
                        <div className="flex flex-col justify-center h-full">
                            <div ref={setNodeRef('root')} className="w-96 p-6 rounded-3xl bg-slate-900 text-white shadow-2xl border-4 border-slate-700 z-10 transition-transform">
                                <div className="text-xs uppercase tracking-widest opacity-60 font-bold mb-2">Core Issue</div>

                                <EditableText
                                    text={rootQuestion.text}
                                    onSave={updateRootText}
                                    isEditing={editingNodes.has('root')}
                                    setEditing={(val) => toggleEditing('root', val)}
                                    className="text-2xl font-bold bg-transparent border-transparent hover:bg-slate-800 text-white"
                                    placeholder="输入你的核心问题..."
                                />

                                <div className="mt-6 pt-4 border-t border-slate-700 flex justify-end">
                                    <button
                                        onClick={handleAIAnalyze}
                                        disabled={isAnalyzing}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${isAnalyzing
                                            ? 'bg-slate-700 text-slate-400 cursor-wait'
                                            : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:scale-105 text-white shadow-lg'
                                            }`}
                                    >
                                        {isAnalyzing ? (
                                            <><Sparkles className="animate-spin" size={16} /> Breaking Down...</>
                                        ) : (
                                            <><Play size={16} fill="currentColor" /> AI Auto-Analyze</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* LEVEL 2-4: SubQs -> Hypos -> Evidence */}
                        {rootQuestion.isOpen && (
                            <div className="flex flex-col gap-12 py-10">
                                {subQuestions.map(sq => {
                                    const isExpanded = expandedSubQs.has(sq.id);
                                    const childHypos = hypotheses.filter(h => h.parentId === sq.id);

                                    return (
                                        <div key={sq.id} className="flex flex-row items-start gap-32">

                                            {/* Sub-Question Node */}
                                            <div className="relative z-10 group">
                                                <div ref={setNodeRef(sq.id)} className="w-80 bg-white border-2 border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all">
                                                    <div className="p-5" onClick={() => toggleSubQExpand(sq.id)}>
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Level 2</span>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); deleteSubQuestion(sq.id); }}
                                                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1 rounded hover:bg-red-50"
                                                                    title="删除子问题"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                                {isExpanded ? <ChevronDown size={16} className="text-blue-500" /> : <ChevronRight size={16} className="text-slate-400" />}
                                                            </div>
                                                        </div>
                                                        <EditableText
                                                            text={sq.text}
                                                            onSave={(val) => updateSubQText(sq.id, val)}
                                                            isEditing={editingNodes.has(sq.id)}
                                                            setEditing={(val) => toggleEditing(sq.id, val)}
                                                            className="font-semibold text-slate-700 text-lg leading-snug"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Hypotheses Column */}
                                            {isExpanded && (
                                                <div className="flex flex-col gap-8">
                                                    {childHypos.map(h => {
                                                        const isDragOver = dragOverHypo === h.id;
                                                        const childEvidence = evidence.filter(e => e.parentId === h.id);

                                                        return (
                                                            <div key={h.id} className="flex flex-row items-start gap-32">
                                                                {/* Hypothesis Node */}
                                                                <div className="relative z-10">
                                                                    <div
                                                                        ref={setNodeRef(h.id)}
                                                                        onDragOver={(e) => handleDragOver(e, h.id)}
                                                                        onDragLeave={handleDragLeave}
                                                                        onDrop={(e) => handleDrop(e, h.id)}
                                                                        className={`w-80 p-5 rounded-2xl border-2 transition-all group/hypo ${isDragOver
                                                                            ? 'bg-purple-50 border-purple-500 border-dashed scale-105 shadow-xl'
                                                                            : 'bg-white border-purple-200 shadow-md'
                                                                            }`}
                                                                    >
                                                                        <div className="flex gap-3">
                                                                            <div className="mt-1 w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold flex-none">H</div>
                                                                            <div className="flex-1">
                                                                                <EditableText
                                                                                    text={h.text}
                                                                                    onSave={(val) => updateHypoText(h.id, val)}
                                                                                    isEditing={editingNodes.has(h.id)}
                                                                                    setEditing={(val) => toggleEditing(h.id, val)}
                                                                                    className="font-medium text-slate-700 text-sm leading-relaxed"
                                                                                />
                                                                            </div>
                                                                            <button
                                                                                onClick={() => deleteHypothesis(h.id)}
                                                                                className="opacity-0 group-hover/hypo:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1 rounded hover:bg-red-50 flex-none"
                                                                                title="删除假设"
                                                                            >
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        </div>
                                                                        {isDragOver && (
                                                                            <div className="mt-3 text-center text-xs font-bold text-purple-600 animate-pulse">
                                                                                Drop to Verify Evidence
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Evidence Column */}
                                                                <div className="flex flex-col gap-4">
                                                                    {childEvidence.map(ev => (
                                                                        <div key={ev.id} ref={setNodeRef(ev.id)} className={`w-72 p-4 rounded-xl border-l-4 shadow-sm bg-white relative z-10 transition-all group/ev ${ev.status === 'support' ? 'border-l-green-500 bg-green-50/30' :
                                                                            ev.status === 'refute' ? 'border-l-red-500 bg-red-50/30' : 'border-l-gray-300'
                                                                            }`}>
                                                                            <div className="mb-2 flex items-center justify-between">
                                                                                <div className="flex items-center gap-2">
                                                                                    {ev.status === 'analyzing' && <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">AI Checking...</span>}
                                                                                    {ev.status === 'support' && <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"><Check size={10} /> Support</span>}
                                                                                    {ev.status === 'refute' && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"><X size={10} /> Refute</span>}
                                                                                    {ev.status === 'neutral' && <span className="bg-gray-100 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"><Minus size={10} /> Neutral</span>}
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => deleteEvidence(ev.id)}
                                                                                    className="opacity-0 group-hover/ev:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1 rounded hover:bg-red-50"
                                                                                    title="删除证据"
                                                                                >
                                                                                    <Trash2 size={12} />
                                                                                </button>
                                                                            </div>
                                                                            <div className="text-xs text-slate-800 font-medium line-clamp-3 mb-1">{ev.text}</div>
                                                                            {ev.explanation && (
                                                                                <div className="text-[10px] text-slate-500 italic border-t pt-1 mt-1">
                                                                                    AI: {ev.explanation}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Add Hypothesis Button */}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); addHypothesis(sq.id); }}
                                                        className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-purple-300 text-purple-600 hover:bg-purple-50 hover:border-purple-400 transition-all text-sm font-medium w-80"
                                                    >
                                                        <Plus size={16} />
                                                        添加假设
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Add Sub-Question Button */}
                                <button
                                    onClick={addSubQuestion}
                                    className="flex items-center gap-2 px-5 py-4 rounded-2xl border-2 border-dashed border-slate-300 text-slate-600 hover:bg-slate-100 hover:border-slate-400 transition-all text-sm font-medium w-80"
                                >
                                    <Plus size={18} />
                                    添加子问题
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
