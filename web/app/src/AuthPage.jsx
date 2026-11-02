import { useState } from 'react';
import { Anchor, ArrowRight, Eye, EyeOff, Leaf, LockKeyhole, ShipWheel, Waves } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

function BrandPanel() { return <section className="auth-brand" aria-label="Aisland 水面机器人云管理平台">
  <div className="auth-brand-top"><span className="auth-logo"><ShipWheel size={22}/></span><div><strong>Aisland</strong><span>水面机器人云管理平台</span></div></div>
  <div className="auth-brand-copy"><p className="auth-kicker">WATERWAY OPERATIONS</p><h1>让每一片水域，<br/><em>清晰可控。</em></h1><p>统一查看水面机器人、航线与清洁任务，在同一个工作台持续掌握现场。</p></div>
  <div className="auth-radar" aria-hidden="true"><span/><span/><span/><i/></div>
  <div className="auth-brand-foot"><span><Waves size={15}/> 实时水域态势</span><span><Leaf size={15}/> 清洁作业协同</span><span><Anchor size={15}/> 船队统一管理</span></div>
</section> }

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'; const { user, loading, registrationEnabled, signIn, signUp } = useAuth();
  const navigate = useNavigate(); const location = useLocation();
  const [showPassword,setShowPassword]=useState(false); const [showConfirm,setShowConfirm]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [fields,setFields]=useState({});
  if (!loading && user) return <Navigate to="/" replace/>;
  if (isRegister && !loading && !registrationEnabled) return <Navigate to="/login" replace/>;
  async function submit(event) { event.preventDefault(); setError('');setFields({});const data=new FormData(event.currentTarget);const password=data.get('password');if(isRegister&&password!==data.get('confirmPassword')){setFields({confirmPassword:'两次输入的密码不一致'});return}setBusy(true);try{if(isRegister){await signUp({username:data.get('username'),displayName:data.get('displayName'),email:data.get('email'),password,rememberMe:data.get('rememberMe')==='on'});navigate('/',{replace:true})}else{await signIn({login:data.get('login'),password,rememberMe:data.get('rememberMe')==='on'});navigate(location.state?.from?.pathname||'/',{replace:true})}}catch(e){setError(e.message);setFields(e.fields||{})}finally{setBusy(false)} }
  return <main className="auth-page"><BrandPanel/><section className="auth-form-side"><div className="auth-form-wrap">
    <div className="auth-mobile-brand"><span className="auth-logo"><ShipWheel size={20}/></span><strong>Aisland</strong></div>
    <p className="auth-step">{isRegister ? '建立你的工作账号' : '返回作业控制台'}</p><h2>{isRegister?'创建账号':'欢迎回来'}</h2><p className="auth-subtitle">{isRegister?'注册后即可进入水面机器人管理平台。':'使用用户名或邮箱继续管理你的水域。'}</p>
    {error&&<div className="auth-alert" role="alert">{error}</div>}
    <form className="auth-form" onSubmit={submit} noValidate>
      {isRegister&&<><Field label="用户名" name="username" placeholder="字母、数字或下划线，不限长度" error={fields.username}/><Field label="显示名称" name="displayName" placeholder="例如：清洁调度员" error={fields.displayName}/><Field label="邮箱" name="email" type="email" autoComplete="email" placeholder="name@example.com" error={fields.email}/></>}
      {!isRegister&&<Field label="用户名或邮箱" name="login" autoComplete="username" placeholder="输入用户名或邮箱" error={fields.login}/>} 
      <PasswordField label="密码" name="password" autoComplete={isRegister?'new-password':'current-password'} show={showPassword} setShow={setShowPassword} error={fields.password}/>
      {isRegister&&<PasswordField label="确认密码" name="confirmPassword" autoComplete="new-password" show={showConfirm} setShow={setShowConfirm} error={fields.confirmPassword}/>} 
      <label className="auth-check"><input type="checkbox" name="rememberMe"/><span>保持登录 30 天</span></label>
      <button className="auth-submit" disabled={busy}>{busy?(isRegister?'正在创建…':'正在登录…'):(isRegister?'创建并进入平台':'进入管理平台')}<ArrowRight size={18}/></button>
    </form>
    <p className="auth-switch">{isRegister?'已有账号？':'还没有账号？'} {isRegister?<Link to="/login">返回登录</Link>:registrationEnabled?<Link to="/register">免费创建账号</Link>:<span>当前未开放注册</span>}</p>
    {isRegister&&<p className="auth-terms">注册即表示你同意相关服务规范与隐私规则。</p>}
  </div></section></main>
}
function Field({label,error,...props}){return <label className={`auth-field ${error?'has-error':''}`}><span>{label}</span><input required {...props}/>{error&&<small>{error}</small>}</label>}
function PasswordField({label,name,show,setShow,error,autoComplete}){return <label className={`auth-field ${error?'has-error':''}`}><span>{label}</span><div className="password-input"><LockKeyhole size={17}/><input name={name} type={show?'text':'password'} required autoComplete={autoComplete} placeholder="输入密码，不限长度"/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'隐藏密码':'显示密码'}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>{error&&<small>{error}</small>}</label>}
