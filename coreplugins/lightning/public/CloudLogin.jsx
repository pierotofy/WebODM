import React from 'react';
import ErrorMessage from 'webodm/components/ErrorMessage';
import PropTypes from 'prop-types';
import './CloudLogin.scss';
import $ from 'jquery';
import { _, interpolate } from 'webodm/classes/gettext';
import { setCloudToken } from './CloudTokenStore';

export default class CloudLogin extends React.Component {
  static defaultProps = {
    apiBase: "https://webodm.net"
  };
  static propTypes = {
    apiKey: PropTypes.string.isRequired,
    onLogin: PropTypes.func.isRequired,
    apiBase: PropTypes.string
  }

  constructor(props){
    super(props);

    this.state = {
        error: "",
        loginError: "",
        loading: true,
        loggingIn: false,
        showResetPwd: false,
        cloudNotFound: false,
        password: "",
        user: null
    }
  }

  componentDidMount(){
    
    this.userReq = $.get(`${this.props.apiBase}/r/user?api_key=${this.props.apiKey}`)
        .done((json) => {
            if (json.balance !== undefined){
                this.setState({user: json});
                setTimeout(() => {
                    if (this.passwordField) this.passwordField.focus();
                }, 0);
            }else{
                this.setState({error:  _("Invalid response. Try again later.")});
            }
        }).fail(() => {
            this.setState({error:  _("Invalid response. Try again later.")})
        }).always(() => {
            this.setState({loading: false});
        });
  }

  componentWillUnmount(){
    if (this.userReq){
        this.userReq.abort();
        this.userReq = null;
    }
  }

  handlePasswordChange = (e) => {
      this.setState({password: e.target.value});
  }

  handleLogin = () => {
      this.setState({loggingIn: true});

      $.post(`${this.props.apiBase}/r/auth/cloud`,
        {
          api_key: this.props.apiKey,
          password: this.state.password
        }
      ).done(json => {
          if (json.token){
            setCloudToken(this.props.apiKey, json.token);
            this.setState({ showResetPwd: false});
            this.props.onLogin(json);
          }else if (json.code === 'invalid'){
            this.setState({ showResetPwd: true, loginError: _("Invalid password. Do you need to reset it?")});
          }else if (json.code === 'not_found'){
            // Show info box to open cloud interface once
            this.setState({cloudNotFound: true});
          }else{
            this.setState({ loginError: _("Cannot login. Invalid response:") + " " + JSON.stringify(json)});
          }
      }).fail(() => {
          this.setState({error: _("Cannot login. Please make sure you are connected to the internet, or try again in an hour.")});
      }).always(() => {
        this.setState({loggingIn: false});
      })
  }

  handleKeyPress = (e) => {
    if (e.key === 'Enter'){
        this.handleLogin();
    }
  }

  render(){
    const { loading, error, user, showResetPwd, loginError, cloudNotFound } = this.state;

    let content = "";
    if (loading) content = <i className="fa fa-circle-notch fa-spin"></i>;
    else{
        if (!error){
            if (cloudNotFound){
                content = <div className="alert alert-info" dangerouslySetInnerHTML={{__html: interpolate(_("Your Lightning cloud platform account is not active yet. To activate it, visit %(link)s and make sure you can access the cloud platform, then try again."), {
                        link: `<a href="${this.props.apiBase}/cloud" target="_blank">${this.props.apiBase.replace(/^https?:\/\//, "")}/cloud</a>`
                    })}}>
                </div>;
            }else{
                content = <div className="form-group text-left">
                    <ErrorMessage bind={[this, "loginError"]} />

                    {!loginError ? <div style={{marginBottom: '24px'}}>{_("Please confirm the password of your Lightning account to continue:")}</div> : ""}

                    <div style={{marginBottom: '12px', marginBottom: '12px'}}>
                        <div className="login-labels">
                            <label htmlFor="password">{_("Password")}</label> 
                            <label>{user.email} <div style={{display: 'inline-block', marginLeft: '4px'}}><small>(<a href="/plugins/lightning/">{_("switch")}</a>)</small></div></label>
                        </div>
                        <input ref={domNode => { this.passwordField = domNode }} className="form-control" id="password" name="password" required="" 
                            type="password" value={this.state.password} 
                            onChange={this.handlePasswordChange} 
                            onKeyPress={this.handleKeyPress} />
                    </div>
                    {showResetPwd ? <div style={{float: 'right', marginTop: '4px'}} >
                        <a href={`${this.props.apiBase}/reset`} target="_blank">{_("Reset password")}</a>
                    </div> : ""}
                    <div>
                        <button className="btn btn-primary" onClick={this.handleLogin} disabled={this.state.loggingIn}>
                        {this.state.loggingIn ? 
                        <span><i className="fa fa-spin fa-circle-notch"></i></span> : 
                        <span><i className="fa fa-lock"></i> {_("Confirm Password")}</span>}
                        </button>
                    </div>
                </div>;
            }
        }
    }
    return (<div className="lightning-cloud-login">
        <div className="row">
            <div className="col-sm-12">
                <ErrorMessage bind={[this, "error"]} />

                {content}
            </div>
        </div>
    </div>);
  }
}