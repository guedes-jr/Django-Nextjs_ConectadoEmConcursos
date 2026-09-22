import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const RichTextEditor = ({ value, onChange, placeholder, className, ...props }) => {
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'script': 'sub'}, { 'script': 'super' }], // Adicionado subscrito e sobrescrito
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['blockquote', 'code-block'],
      ['link', 'image', 'video'],
      ['clean']
    ],
  };

  const formats = [
    'header', 'bold', 'italic', 'underline', 'strike', 'script', // Permitir formatação de script
    'color', 'background', 'align', 'list', 'bullet', 'indent',
    'blockquote', 'code-block', 'link', 'image', 'video'
  ];

  return (
    <div className={`rich-text-editor ${className || ''}`}>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        modules={modules}
        formats={formats}
        style={{
          backgroundColor: 'white',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
        }}
        {...props}
      />
      <style jsx global>{`
        .ql-toolbar {
          border-top: 1px solid #d1d5db;
          border-left: 1px solid #d1d5db;
          border-right: 1px solid #d1d5db;
          border-bottom: none;
          border-radius: 6px 6px 0 0;
        }
        .ql-container {
          border-left: 1px solid #d1d5db;
          border-right: 1px solid #d1d5db;
          border-bottom: 1px solid #d1d5db;
          border-top: none;
          border-radius: 0 0 6px 6px;
        }
        .ql-editor {
          min-height: 120px;
          font-size: 14px;
          line-height: 1.5;
        }
        .ql-editor::before {
          font-style: normal;
          color: #9ca3af;
        }
        /* Correção para vídeo responsivo */
        .ql-editor .ql-video {
          width: 100%;
          aspect-ratio: 16 / 9;
          height: auto;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;