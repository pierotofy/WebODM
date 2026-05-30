import React from 'react';
import ErrorMessage from 'webodm/components/ErrorMessage';
import PropTypes from 'prop-types';
import './CloudLogin.scss';
import $ from 'jquery';
import { _ } from 'webodm/classes/gettext';

export default class Login extends React.Component {
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
        loading: true,
        loggingIn: false,
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
          token: this.props.apiKey,
          password: this.state.password
        }
      ).done(json => {
          if (json.token){
              this.saveCloudToken(json.token, (err) => {
                this.setState({loggingIn: false});

                if (!err){
                    this.props.onLogin(json);
                }else{
                    this.setState({ error: err.message });
                }
              });
          }else if (json.message){
              this.setState({ loggingIn: false, error: json.message });
          }else{
              this.setState({ loggingIn: false, error: _("Cannot login. Invalid response:") + " " + JSON.stringify(json)});
          }
      })
      .fail(() => {
          this.setState({loggingIn: false, error: _("Cannot login. Please make sure you are connected to the internet, or try again in an hour.")});
      });
  }

  handleKeyPress = (e) => {
    if (e.key === 'Enter'){
        this.handleLogin();
    }
  }

  saveCloudToken = (token, cb) => {
      $.post("/plugins/lightning/save_cloud_token", {
          token
      }).done(json => {
        if (!json.success){
            cb(new Error(`Cannot save token: ${JSON.stringify(json)}`));
        }else cb();
      }).fail(e => {
        cb(new Error(`Cannot save token: ${JSON.stringify(e)}`));
      });
  }

  render(){
    const { loading, error, user } = this.state;

    return (<div className="lightning-cloud-login">
        <div className="row">
            <div className="col-sm-12">
                <ErrorMessage bind={[this, "error"]} />

                {loading ? <i className="fa fa-circle-notch fa-spin"></i> :
                (!error ? <div className="form-group text-left">
                    <div style={{marginBottom: '12px'}}>
                        <div className="login-labels">
                            <label htmlFor="password">{_("Password")}</label> 
                            <label>{user.email} <div style={{display: 'inline-block', marginLeft: '4px'}}><small>(<a href="/plugins/lightning/">{_("switch")}</a>)</small></div></label>
                        </div>
                        <input ref={domNode => { this.passwordField = domNode }} className="form-control" id="password" name="password" required="" 
                            type="password" value={this.state.password} 
                            onChange={this.handlePasswordChange} 
                            onKeyPress={this.handleKeyPress} />
                    </div>
                    {/* <div style={{float: 'right', marginTop: '4px'}} >
                        <a href={`${this.props.apiBase}/reset`} target="_blank">{_("Forgot password?")}</a>
                    </div> */}
                    <p><button className="btn btn-primary" onClick={this.handleLogin} disabled={this.state.loggingIn}>
                        {this.state.loggingIn ? 
                        <span><i className="fa fa-spin fa-circle-notch"></i></span> : 
                        <span><i className="fa fa-lock"></i> {_("Confirm Password")}</span>}
                    </button></p>
                </div> : "")}
            </div>
        </div>
    </div>);
  }
}