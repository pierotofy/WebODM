import React from 'react';
import PropTypes from 'prop-types';
import Login from './Login';
import Dashboard from './Dashboard';
import { _ } from 'webodm/classes/gettext';
import Trans from 'webodm/components/Trans';

export default class LightningPanel extends React.Component {
  static defaultProps = {
    apiKey: "", 
    apiBase: "https://webodm.net"
  };
  static propTypes = {
    apiKey: PropTypes.string,
    apiBase: PropTypes.string
  }

  constructor(props){
    super(props);


    this.state = {
      apiKey: props.apiKey
    }
  }

  handleLogin = (apiKey) => {
    this.setState({ apiKey });
  }

  handleLogout = () => {
      this.setState({ apiKey: ""});
  }

  render(){
    const { apiKey } = this.state;
    const { apiBase } = this.props;

    return (<div className="plugin-lightning">
        { !apiKey ? 
        <div>
            <h4><i className="fa fa-bolt"/> {_("Lightning")}</h4>
            <p>{_("Lightning is a cloud service built by WebODM developers that allows you to:")}</p>
            <ul>
              <li><Trans params={{ link: '<a href="https://webodm.net/lgt" target="_blank">LGT</a>'}}>
                  {_("Quickly process datasets with high performance servers powered by the %(link)s photogrammetry engine")}
                  </Trans>
              </li>
              <li>{_("Easily share public links to your datasets")}</li>
            </ul>
            <Trans params={{ link: '<a href="https://webodm.net" target="_blank">webodm.net</a>', register: `<a href="https://webodm.net/register" target="_blank">${_("register")}</a>`}}>
            {_("Below you can enter your %(link)s credentials to sync your account and automatically setup a new processing node. If you don't have an account, you can %(register)s for free.")}</Trans>
            <Login apiBase={apiBase} onLogin={this.handleLogin} />
        </div> : 
        <div>
            <Dashboard apiKey={apiKey} apiBase={apiBase} onLogout={this.handleLogout} />
        </div>}
    </div>);
  }
}