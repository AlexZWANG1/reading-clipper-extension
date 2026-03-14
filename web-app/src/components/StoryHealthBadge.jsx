import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  bias_warning: { text: '偏见警告', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  no_evidence: { text: '无证据', color: 'bg-gray-100 text-gray-500 border-gray-300' },
  insufficient: { text: '证据不足', color: 'bg-amber-50 text-amber-600 border-amber-200' },
};

export default function StoryHealthBadge({ hypothesis, topicId }) {
  const navigate = useNavigate();

  if (!hypothesis) return null;

  const config = STATUS_LABELS[hypothesis.status];
  if (!config) return null; // No warning needed for strong_support, mixed, etc.

  const handleClick = () => {
    if (topicId) {
      navigate(`/topics/${topicId}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border mt-1 hover:opacity-80 transition-opacity ${config.color}`}
      title={`点击查看画板中的假说：${hypothesis.text}`}
    >
      引用假说「{hypothesis.text?.slice(0, 20)}」{config.text}
      {hypothesis.support !== undefined && `: ${hypothesis.support}支持 ${hypothesis.refute}反对`}
    </button>
  );
}
